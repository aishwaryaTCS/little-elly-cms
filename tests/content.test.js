/**
 * Phase 1 tests for CONTENT_CMS_SPEC.md: validation (§4), sanitising (§4.3, SEC-3..5),
 * image slots and pipeline (§6), and image use tracking (BR-8).
 *
 * The pipeline and database tests use the real uploads folder and Atlas (from .env).
 * The upload API tests need the CMS running (npm run dev).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import mongoose from "mongoose";
import sharp from "sharp";
import { env } from "../src/config/env.js";
import { imageIsUsed, retireIfUnused } from "../src/lib/images.js";
import { checkJsonLd, isSafeHref, jsonForScript, sanitizeInline } from "../src/lib/sanitize.js";
import { slotError, slotHelp, storedWidths } from "../src/lib/slots.js";
import { FILENAME, storeSlotImage, uploadRoot } from "../src/lib/storage.js";
import { COOKIE, signAdmin } from "../src/lib/tokens.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { BlogPost, Program, TeamMember } from "../src/models/content.js";
import { contentSchemas, reorderSchema, uploadSlotSchema } from "../src/validation/content.js";

const draft = contentSchemas.draft;
const live = contentSchemas.publish;
const made = [];

function issues(result) {
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
}

async function photo(width, height, { format = "jpeg", exif, orientation } = {}) {
  let pipeline = sharp({ create: { width, height, channels: 3, background: { r: 232, g: 82, b: 83 } } });
  pipeline = format === "png" ? pipeline.png() : pipeline.jpeg({ quality: 70 });
  if (exif) pipeline = pipeline.withExif(exif);
  if (orientation) pipeline = pipeline.withMetadata({ orientation });
  return pipeline.toBuffer();
}

function filesOf(image) {
  return image.variants.map((variant) => path.join(uploadRoot(), variant.url.split("/").pop()));
}

async function stored(slot, width, height, options) {
  const image = await storeSlotImage(await photo(width, height, options), slot);
  made.push(image);
  return { ...image, alt: "Children at a Little Elly centre" };
}

after(async () => {
  for (const image of made) for (const file of filesOf(image)) fs.rmSync(file, { force: true });
});

describe("image slots", () => {
  test("fixed shapes need the ratio within 1% and the minimum size", () => {
    assert.equal(slotError("teamPerson", 768, 1024), "");
    assert.equal(slotError("teamPerson", 900, 1200), "");
    assert.equal(slotError("teamPerson", 1800, 2400), "");
    assert.equal(slotError("teamPerson", 905, 1200), "", "0.6% off is allowed");
    assert.match(slotError("teamPerson", 920, 1200), /3:4 photo at least 768 × 1024 px\. This one is 920 × 1200 px\./);
    assert.match(slotError("teamPerson", 600, 800), /at least 768 × 1024/);
    assert.match(slotError("teamPerson", 1200, 900), /3:4/);
    assert.equal(slotError("share", 1200, 630), "");
    assert.equal(slotError("news", 1024, 576), "");
    assert.equal(slotError("blogCover", 1024, 576), "", "today's 1024 px covers pass");
    assert.match(slotError("news", 1024, 684), /16:9/, "a 3:2 photo is the wrong shape");
    assert.match(slotError("news", 1008, 567), /at least 1024 × 576/, "right shape, too small");
  });

  test("free shapes check range and size", () => {
    assert.equal(slotError("award", 1000, 1400), "");
    assert.match(slotError("award", 1000, 2000), /up to 1\.6:1/);
    assert.equal(slotError("award", 629, 538), "", "today's award scans pass");
    assert.match(slotError("award", 400, 500), /long side of at least 600/);
    assert.equal(slotError("blogInline", 1000, 2000), "");
    assert.match(slotError("blogInline", 3100, 1000), /1:2 to 3:1/);
    assert.match(slotError("blogInline", 900, 600), /1000 px wide/);
    assert.match(slotError("nope", 100, 100), /Choose where/);
  });

  test("stored widths never upscale and never repeat", () => {
    assert.deepEqual(storedWidths("teamPerson", 3000), [900, 450]);
    assert.deepEqual(storedWidths("award", 1000), [1000, 400]);
    assert.deepEqual(storedWidths("award", 400), [400]);
    assert.equal(slotHelp("teamPerson"), "3:4 portrait · min 768 × 1024 px · JPG, PNG or WebP · max 8 MB");
  });

  test("slot names are checked", () => {
    assert.equal(uploadSlotSchema.safeParse("teamPerson").success, true);
    assert.equal(uploadSlotSchema.safeParse("../etc").success, false);
  });
});

describe("image pipeline", () => {
  test("saves WebP copies at slot widths with no metadata", async () => {
    const gps = { IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 58/1 0/1" } };
    const input = await photo(1800, 2400, { exif: gps });
    assert.ok((await sharp(input).metadata()).exif, "the test photo carries EXIF");

    const image = await stored("teamPerson", 1800, 2400, { exif: gps });
    assert.equal(image.contentType, "image/webp");
    assert.equal(image.slot, "teamPerson");
    assert.deepEqual([image.width, image.height], [900, 1200]);
    assert.deepEqual(image.variants.map((v) => v.width), [900, 450]);
    assert.equal(image.url, `/media/${image.filename}`);
    for (const file of filesOf(image)) {
      assert.ok(fs.existsSync(file), `${file} exists`);
      assert.ok(FILENAME.test(path.basename(file)));
      const meta = await sharp(file).metadata();
      assert.equal(meta.format, "webp");
      assert.equal(meta.exif, undefined, "EXIF and GPS are stripped");
    }
  });

  test("EXIF rotation is applied before the shape check", async () => {
    // Stored sideways (1200 × 900) but tagged to display upright as 900 × 1200.
    const image = await stored("teamPerson", 1200, 900, { orientation: 6 });
    assert.deepEqual([image.width, image.height], [900, 1200]);
  });

  test("wrong shapes, small images and non-images are refused", async () => {
    await assert.rejects(storeSlotImage(await photo(1200, 900), "teamPerson"), (error) => {
      assert.equal(error.status, 400);
      assert.match(error.message, /Use a 3:4 photo at least 768 × 1024 px\. This one is 1200 × 900 px\./);
      return true;
    });
    await assert.rejects(storeSlotImage(await photo(300, 400), "teamPerson"), /at least 768 × 1024/);
    await assert.rejects(storeSlotImage(Buffer.from("<svg></svg>"), "teamPerson"), /JPEG, PNG, or WebP/);
    await assert.rejects(storeSlotImage(await photo(900, 1200), "bogus"), /Choose where/);
    const truncated = (await photo(900, 1200)).subarray(0, 200);
    await assert.rejects(storeSlotImage(truncated, "teamPerson"), (error) => error.status === 400);
  });

  test("PNG input is accepted for a free-shape slot", async () => {
    const image = await stored("award", 1000, 1400, { format: "png" });
    assert.deepEqual(image.variants.map((v) => v.width), [1000, 400]);
  });
});

describe("content validation", () => {
  test("drafts may be incomplete; publishing needs every required field", async () => {
    const empty = { kind: "person", name: "", role: "", photo: null };
    assert.equal(draft.teamMember.safeParse(empty).success, true);
    const errors = issues(live.teamMember.safeParse(empty));
    assert.deepEqual(Object.keys(errors).sort(), ["name", "photo", "role"]);
    assert.equal(errors.photo, "Add an image.");

    const full = { kind: "person", name: "Preeti Alva", role: "Head of Operations", note: "", photo: await stored("teamPerson", 900, 1200) };
    assert.equal(live.teamMember.safeParse(full).success, true);
  });

  test("upper limits apply even to drafts", () => {
    const long = { kind: "person", name: "x".repeat(41), role: "", photo: null };
    assert.equal(issues(draft.teamMember.safeParse(long)).name, "Keep this under 40 characters.");
    assert.equal(issues(draft.award.safeParse({ issuer: "", line: "y".repeat(91), image: null })).line, "Keep this under 90 characters.");
  });

  test("unknown fields, status and flags are rejected in edit bodies", () => {
    const base = { kind: "group", name: "Zonal Team", line: "", photo: null };
    assert.equal(draft.teamMember.safeParse(base).success, true);
    assert.equal(draft.teamMember.safeParse({ ...base, status: "published" }).success, false);
    assert.equal(draft.teamMember.safeParse({ ...base, $where: "1" }).success, false);
    assert.equal(draft.teamMember.safeParse({ ...base, kind: "robot" }).success, false);
  });

  test("image references must match the slot and the stored file", async () => {
    const image = await stored("teamGroup", 1600, 1000);
    const ok = { kind: "group", name: "Curriculum Team", line: "", photo: image };
    assert.equal(live.teamMember.safeParse(ok).success, true);
    // A group photo cannot be used in a person card (different slot).
    const wrongSlot = { kind: "person", name: "Someone", role: "Teacher", photo: image };
    assert.match(Object.values(issues(live.teamMember.safeParse(wrongSlot)))[0], /different place/);
    // Forged links are refused.
    for (const forged of [
      { ...image, url: "https://evil.example/x.webp" },
      { ...image, url: "/media/../../.env" },
      { ...image, key: "other.webp" },
      { ...image, filename: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png" },
      { ...image, variants: [{ width: image.width, url: "javascript:alert(1)" }] },
    ]) {
      assert.equal(live.teamMember.safeParse({ ...ok, photo: forged }).success, false);
    }
    // Alt text is required on publish, 5–125 characters.
    assert.equal(issues(live.teamMember.safeParse({ ...ok, photo: { ...image, alt: "" } }))["photo.alt"], "Use at least 5 characters.");
    assert.equal(draft.teamMember.safeParse({ ...ok, photo: { ...image, alt: "" } }).success, true);
  });

  test("programs need exactly 3 learn points and 4–8 skills", async () => {
    const body = {
      slug: "zz-sunbeam",
      name: "Sunbeam",
      ageLabel: "6 years +",
      shortAge: "6y+",
      line: "A gentle bridge to big school.",
      longDescription: "A calm, structured year that turns curiosity into steady habits for reading, numbers and friendship.",
      learn: ["Reading aloud with confidence", "Numbers to 100", "Working in small teams"],
      skills: ["Phonics", "Logic", "Story time", "Art"],
      ratio: { adults: 2, children: 20 },
      accent: "turquoise",
      pageAgeLabel: "6 years +",
      pageLine: "Big school, gently.",
      pageAccent: "periwinkle",
      cardPhoto: await stored("programCard", 1000, 1000),
      photo: await stored("programDetail", 1600, 1200),
      seo: {
        metaTitle: "Sunbeam Program | Little Elly",
        metaDescription: "Sunbeam at Little Elly: a calm, structured year that turns curiosity into steady habits.",
      },
    };
    assert.equal(live.program.safeParse(body).success, true, JSON.stringify(issues(live.program.safeParse(body))));
    assert.match(issues(live.program.safeParse({ ...body, learn: body.learn.slice(0, 2) })).learn, /exactly 3/);
    assert.match(issues(live.program.safeParse({ ...body, skills: ["a b c"] })).skills, /at least 4/);
    assert.equal(live.program.safeParse({ ...body, accent: "#ff0000" }).success, false);
    assert.equal(live.program.safeParse({ ...body, slug: "Bad Slug" }).success, false);
    assert.equal(live.program.safeParse({ ...body, slug: "double--hyphen" }).success, false);
    assert.equal(live.program.safeParse({ ...body, ratio: { adults: 0, children: 5 } }).success, false);
    assert.match(issues(live.program.safeParse({ ...body, seo: { ...body.seo, metaTitle: "x".repeat(61) } }))["seo.metaTitle"], /60/);
  });

  test("SEO fields: robots, canonical, keywords, JSON-LD", () => {
    const seo = live.seo();
    const base = { metaTitle: "Little Elly Preschool", metaDescription: "d".repeat(60) };
    const parsed = seo.parse({ ...base, keywords: ["Preschool", "preschool", "Daycare"] });
    assert.deepEqual(parsed.keywords, ["Preschool", "Daycare"], "duplicates are removed");
    assert.equal(parsed.robots, "index,follow");
    assert.equal(seo.safeParse({ ...base, robots: "noindex" }).success, false);
    assert.equal(seo.safeParse({ ...base, canonicalUrl: "http://littleelly.com/x" }).success, false);
    assert.equal(seo.safeParse({ ...base, canonicalUrl: "javascript:alert(1)" }).success, false);
    assert.equal(seo.safeParse({ ...base, canonicalUrl: "https://littleelly.com/about-us/" }).success, true);
    assert.equal(seo.safeParse({ ...base, keywords: Array(11).fill("kw") }).success, true, "duplicates collapse first");
    assert.equal(seo.safeParse({ ...base, keywords: Array.from({ length: 11 }, (_, i) => `kw${i}`) }).success, false);
    assert.equal(seo.safeParse({ ...base, schemaJsonLd: "{not json" }).success, false);
    assert.equal(seo.safeParse({ ...base, schemaJsonLd: '{"@type":"Thing"}' }).success, false, "needs @context");
    const ld = seo.parse({ ...base, schemaJsonLd: ' { "@context": "https://schema.org", "@type": "FAQPage" } ' });
    assert.equal(ld.schemaJsonLd, '{"@context":"https://schema.org","@type":"FAQPage"}');
    // Blog posts fall back to title and excerpt (BL-5), so empty is fine there.
    assert.equal(live.seo({ fallback: true }).safeParse({ metaTitle: "", metaDescription: "" }).success, true);
    assert.equal(seo.safeParse({ metaTitle: "", metaDescription: "" }).success, false);
  });

  test("blog blocks: types, tables and sanitised inline HTML", () => {
    const parse = (blocks) => draft.blogPost.safeParse({
      slug: "",
      title: "",
      excerpt: "",
      category: "",
      author: "",
      coverImage: null,
      blocks,
      seo: { metaTitle: "", metaDescription: "" },
    });
    const ok = parse([
      { type: "p", text: 'Hello <strong>world</strong> <script>alert(1)</script><a href="javascript:alert(1)">bad</a> <a href="https://pib.gov.in/x">PIB</a>' },
      { type: "h3", text: "Signs to look for" },
      { type: "ul", items: ["One <em>thing</em>", "<img src=x onerror=alert(1)>Two"] },
      { type: "table", head: ["Age", "Program"], rows: [["3", "Nursery"]] },
    ]);
    assert.equal(ok.success, true, JSON.stringify(issues(ok)));
    const [p, , ul] = ok.data.blocks;
    assert.equal(
      p.text,
      'Hello <strong>world</strong> bad <a href="https://pib.gov.in/x" target="_blank" rel="noopener noreferrer">PIB</a>',
    );
    assert.deepEqual(ul.items, ["One <em>thing</em>", "Two"]);
    assert.match(Object.values(issues(parse([{ type: "table", head: ["A", "B"], rows: [["1"]] }])))[0], /one cell per column/);
    assert.equal(parse([{ type: "table", head: ["A"], rows: [] }]).success, false, "tables need 2+ columns");
    assert.equal(parse([{ type: "video", text: "x" }]).success, false);
    assert.equal(parse([{ type: "h2", text: "<b>x</b>", extra: 1 }]).success, false);
    assert.equal(parse(Array(201).fill({ type: "h2", text: "Hi there" })).success, false);
  });

  test("news links: site paths and https only", () => {
    const base = { tag: "", title: "", line: "", accent: "coral", image: null };
    for (const link of ["/admissions/", "https://www.instagram.com/littleelly_preschool/", ""]) {
      assert.equal(draft.newsItem.safeParse({ ...base, link }).success, true, link);
    }
    for (const link of ["javascript:alert(1)", "//evil.example", "http://x.com", "data:text/html,x", " java\nscript:x"]) {
      assert.equal(draft.newsItem.safeParse({ ...base, link }).success, false, link);
    }
  });

  test("page sections follow the page", () => {
    const seo = { metaTitle: "Little Elly Blogs", metaDescription: "d".repeat(60) };
    const hero = { kicker: "Blogs", headline: ["Parenting,", "with purpose."], lead: "Notes from twenty years.", pageSize: 9 };
    assert.equal(live.pageSeo("blogs").safeParse({ seo, sections: { hero } }).success, true);
    assert.equal(live.pageSeo("blogs").safeParse({ seo, sections: { hero: { ...hero, pageSize: 50 } } }).success, false);
    assert.equal(live.pageSeo("blogs").safeParse({ seo, sections: { hero: { ...hero, headline: ["One"] } } }).success, false);
    assert.equal(live.pageSeo("curriculum").safeParse({ seo, sections: { hero } }).success, false, "no sections here");
    assert.equal(live.pageSeo("curriculum").safeParse({ seo }).success, true);
  });

  test("site settings", () => {
    const body = {
      siteName: "Little Elly",
      siteOrigin: "https://littleelly.com/",
      organization: { legalName: "Little Elly Preschool", phone: "+91 80 1234 5678", email: "", sameAs: ["https://www.instagram.com/littleelly_preschool/"] },
      googleSiteVerification: "abc_DEF-123",
    };
    assert.equal(live.siteSettings.parse(body).siteOrigin, "https://littleelly.com");
    assert.equal(live.siteSettings.safeParse({ ...body, googleSiteVerification: '"><script>' }).success, false);
    assert.equal(live.siteSettings.safeParse({ ...body, organization: { ...body.organization, sameAs: ["http://x.com"] } }).success, false);
  });

  test("reorder ids are unique object ids", () => {
    assert.equal(reorderSchema.safeParse({ ids: ["a".repeat(24), "b".repeat(24)] }).success, true);
    assert.equal(reorderSchema.safeParse({ ids: ["a".repeat(24), "a".repeat(24)] }).success, false);
    assert.equal(reorderSchema.safeParse({ ids: [{ $gt: "" }] }).success, false);
  });
});

describe("sanitising helpers", () => {
  test("links", () => {
    for (const ok of ["https://littleelly.com", "/blogs/", "mailto:hello@littleelly.com", "tel:+91 80 1234"]) assert.ok(isSafeHref(ok), ok);
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:x", "data:text/html,x", "//evil.example", "http://x.com", "vbscript:x", ""]) {
      assert.equal(isSafeHref(bad), false, bad);
    }
    assert.equal(sanitizeInline('<a href="/admissions/" onclick="x()">Enquire</a>'), '<a href="/admissions/">Enquire</a>');
    assert.equal(sanitizeInline("<p style='x'>Hi</p><iframe src=x></iframe>"), "Hi");
  });

  test("JSON-LD can never close its script tag", () => {
    const out = jsonForScript({ name: "</script><script>alert(1)</script>", amp: "a&b" });
    assert.equal(out.includes("<"), false);
    assert.equal(out.includes(">"), false);
    assert.deepEqual(JSON.parse(out), { name: "</script><script>alert(1)</script>", amp: "a&b" });
    assert.equal(checkJsonLd("x".repeat(11 * 1024)).error, "Keep schema markup under 10 KB.");
    assert.equal(checkJsonLd("[1,2]").error, "Schema markup must be a JSON object or a list of objects.");
  });
});

describe("database", { concurrency: false }, () => {
  before(async () => {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    await Promise.all([TeamMember.init(), Program.init(), BlogPost.init()]);
  });

  after(async () => {
    await TeamMember.deleteMany({ name: /^zz-test/ });
    await Program.deleteMany({ slug: { $in: ["zz-test-unique"] } });
    await Program.deleteMany({ name: "zz-test-draft" });
    await mongoose.disconnect();
  });

  test("an image in use is kept; once unused it is retired with all its copies", async () => {
    const image = await stored("teamPerson", 900, 1200);
    assert.equal(await imageIsUsed(image.filename), false);
    const member = await TeamMember.create({ kind: "person", name: "zz-test person", photo: image });
    assert.equal(await imageIsUsed(image.filename), true);
    await retireIfUnused(image);
    for (const file of filesOf(image)) assert.ok(fs.existsSync(file), "kept while used");
    await member.deleteOne();
    await retireIfUnused(image);
    for (const file of filesOf(image)) assert.equal(fs.existsSync(file), false, "retired when unused");
  });

  test("images inside blog blocks count as used", async () => {
    const image = await stored("blogInline", 1600, 900);
    const post = await BlogPost.create({ title: "zz-test post", blocks: [{ type: "image", image }] });
    try {
      assert.equal(await imageIsUsed(image.filename), true);
    } finally {
      await post.deleteOne();
    }
  });

  test("filled slugs are unique; drafts without a slug do not clash", async () => {
    await Program.create({ name: "zz-test-draft" });
    await Program.create({ name: "zz-test-draft" });
    await Program.create({ slug: "zz-test-unique", name: "One" });
    await assert.rejects(Program.create({ slug: "zz-test-unique", name: "Two" }), (error) => error.code === 11000);
  });
});

describe("upload API", { concurrency: false }, () => {
  const base = process.env.CMS_BASE || "http://localhost:3001";
  let cookie = "";

  async function call(pathname, { method = "GET", body } = {}) {
    const response = await fetch(base + pathname, {
      method,
      headers: { origin: "http://localhost:5173", cookie },
      body,
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : {} };
  }

  function form(buffer, slot) {
    const data = new FormData();
    data.append("file", new Blob([buffer], { type: "image/jpeg" }), "x.jpg");
    if (slot !== undefined) data.append("slot", slot);
    return data;
  }

  before(async () => {
    const health = await fetch(`${base}/api/health`).catch(() => null);
    assert.ok(health?.ok, "Start the CMS API (npm run dev) before the upload API tests.");
    // Sign a session for the seeded admin directly, so these tests do not spend
    // the login rate limit (8 per 15 minutes) that the boundary tests rely on.
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
    const admin = await AdminUser.findOne({ email: env.adminEmail }).select("+tokenVersion").lean();
    await mongoose.disconnect();
    assert.ok(admin, "Seed the admin user first (npm run seed).");
    cookie = `${COOKIE}=${signAdmin(admin)}`;
  });

  test("slot uploads are checked, stored as WebP and served", async () => {
    const wrong = await call("/api/admin/uploads", { method: "POST", body: form(await photo(1200, 900), "teamPerson") });
    assert.equal(wrong.status, 400);
    assert.match(wrong.data.error, /Use a 3:4 photo at least 768 × 1024 px/);

    assert.equal((await call("/api/admin/uploads", { method: "POST", body: form(await photo(900, 1200), "nope") })).status, 400);

    const good = await call("/api/admin/uploads", { method: "POST", body: form(await photo(900, 1200), "teamPerson") });
    assert.equal(good.status, 201);
    const image = good.data.image;
    assert.equal(image.contentType, "image/webp");
    assert.equal(image.variants.length, 2);
    for (const variant of image.variants) {
      const media = await fetch(base + variant.url);
      assert.equal(media.status, 200);
      assert.equal(media.headers.get("content-type"), "image/webp");
    }

    // Deleting by the main name removes every copy.
    assert.equal((await call(`/api/admin/uploads/${image.filename}`, { method: "DELETE" })).status, 200);
    for (const variant of image.variants) assert.equal((await fetch(base + variant.url)).status, 404);
    // A width copy cannot be deleted on its own.
    assert.equal((await call(`/api/admin/uploads/${image.filename.replace(".webp", "-450.webp")}`, { method: "DELETE" })).status, 404);
  });

  test("files over 8 MB are refused", async () => {
    const big = Buffer.concat([await photo(900, 1200), Buffer.alloc(8 * 1024 * 1024)]);
    const response = await call("/api/admin/uploads", { method: "POST", body: form(big, "teamPerson") });
    assert.equal(response.status, 400);
    assert.match(response.data.error, /8 MB/);
  });
});
