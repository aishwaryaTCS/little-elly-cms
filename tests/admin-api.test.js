/**
 * Phase 2 tests: content admin API (CONTENT_CMS_SPEC.md §9.1, BR-1..BR-9, SEO-5, UI-9).
 * Needs the CMS running (npm run dev) and the seeded admin user. Every record made
 * here starts with "zz-" and is removed again; changed settings are restored.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import mongoose from "mongoose";
import sharp from "sharp";
import { env } from "../src/config/env.js";
import { COOKIE, signAdmin } from "../src/lib/tokens.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { BlogCategory, BlogPost, PageSeo, SiteSettings } from "../src/models/content.js";

const base = process.env.CMS_BASE || "http://localhost:3001";
const ORIGIN = "http://localhost:5173";
let cookie = "";
const cleanup = [];

async function call(path, { method = "GET", body, auth = true, origin = ORIGIN } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (auth) headers.cookie = cookie;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(base + path, { method, headers, body: payload });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : {} };
}

const images = new Map();
/** Uploads one image per slot and size (reused across tests), with alt text. */
async function upload(slot, width, height) {
  const key = `${slot}:${width}x${height}`;
  if (!images.has(key)) {
    const buffer = await sharp({ create: { width, height, channels: 3, background: "#09bab7" } }).jpeg().toBuffer();
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: "image/jpeg" }), "x.jpg");
    form.append("slot", slot);
    const response = await call("/api/admin/uploads", { method: "POST", body: form });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    images.set(key, response.data.image);
  }
  return { ...images.get(key), alt: "Children learning at Little Elly" };
}

async function freshUpload(slot, width, height) {
  images.delete(`${slot}:${width}x${height}`);
  return upload(slot, width, height);
}

async function make(resource, body) {
  const response = await call(`/api/admin/${resource}`, { method: "POST", body });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  cleanup.push([resource, response.data.item]);
  return response.data.item;
}

const publish = (resource, id, extra = {}) =>
  call(`/api/admin/${resource}/${id}/status`, { method: "PATCH", body: { status: "published", ...extra } });
const unpublish = (resource, id, extra = {}) =>
  call(`/api/admin/${resource}/${id}/status`, { method: "PATCH", body: { status: "draft", ...extra } });

async function newsBody(n) {
  return {
    tag: "Workshop",
    title: `zz-news ${n} at the centre`,
    line: "A short line about what happened and who came along.",
    accent: "coral",
    image: await upload("news", 1280, 720),
    link: "/admissions/",
  };
}

async function postBody(category, n) {
  return {
    slug: `zz-post-${n}`,
    title: `zz-post ${n}: how children learn through play`,
    excerpt: "A short summary of the story that is long enough to pass the excerpt rule easily.",
    category,
    author: "Little Elly Team",
    coverImage: await upload("blogCover", 1600, 900),
    blocks: [{ type: "p", text: "Play is <strong>serious</strong> work.<script>alert(1)</script>" }],
    seo: { metaTitle: "", metaDescription: "" },
  };
}

before(async () => {
  const health = await fetch(`${base}/api/health`).catch(() => null);
  assert.ok(health?.ok, "Start the CMS API (npm run dev) before these tests.");
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const admin = await AdminUser.findOne({ email: env.adminEmail }).select("+tokenVersion").lean();
  assert.ok(admin, "Seed the admin user first (npm run seed).");
  cookie = `${COOKIE}=${signAdmin(admin)}`;
});

after(async () => {
  for (const [resource, item] of cleanup.reverse()) {
    const query = item.slug ? `?confirm=${item.slug}&hideSection=true` : "?hideSection=true";
    await call(`/api/admin/${resource}/${item.id}${query}`, { method: "DELETE" });
  }
  for (const image of images.values()) await call(`/api/admin/uploads/${image.filename}`, { method: "DELETE" });
  await mongoose.disconnect();
});

describe("access", () => {
  test("every content route needs a session and a trusted origin", async () => {
    for (const path of ["/api/admin/team", "/api/admin/blog-posts", "/api/admin/page-seo", "/api/admin/site-settings", "/api/admin/content-stats"]) {
      assert.equal((await call(path, { auth: false })).status, 401, path);
    }
    assert.equal((await call("/api/admin/team", { method: "POST", body: {}, origin: "https://evil.example" })).status, 403);
    assert.equal((await call("/api/admin/team/not-an-id")).status, 404);
    assert.equal((await call("/api/admin/team/aaaaaaaaaaaaaaaaaaaaaaaa")).data.error, "Team member not found.");
  });
});

describe("team, awards, testimonials (generic CRUD)", { concurrency: false }, () => {
  test("drafts save incomplete; publishing checks every field (BR-1, BR-3)", async () => {
    const item = await make("team", { kind: "person", name: "zz-Asha", role: "", photo: null });
    assert.equal(item.status, "draft");
    assert.ok(item.sortOrder >= 10);

    const refused = await publish("team", item.id);
    assert.equal(refused.status, 400);
    assert.equal(refused.data.error, "Fill in the highlighted fields to publish.");
    assert.deepEqual(Object.keys(refused.data.fields).sort(), ["photo", "role"]);

    const body = { kind: "person", name: "zz-Asha", role: "Centre Head", note: "", photo: await upload("teamPerson", 900, 1200) };
    assert.equal((await call(`/api/admin/team/${item.id}`, { method: "PUT", body })).status, 200);
    const live = await publish("team", item.id);
    assert.equal(live.status, 200);
    assert.equal(live.data.item.status, "published");

    // A live item must stay complete.
    const broken = await call(`/api/admin/team/${item.id}`, { method: "PUT", body: { ...body, role: "" } });
    assert.equal(broken.status, 400);
    assert.equal(broken.data.fields.role, "Use at least 2 characters.");
    // Status, flags and unknown keys cannot ride along in an edit.
    assert.equal((await call(`/api/admin/team/${item.id}`, { method: "PUT", body: { ...body, status: "draft" } })).status, 400);
    assert.equal((await call(`/api/admin/team/${item.id}`, { method: "PUT", body: { ...body, sortOrder: 1 } })).status, 400);
    // A person cannot turn into a group photo.
    const group = { kind: "group", name: "zz-Asha", line: "", photo: null };
    assert.equal((await call(`/api/admin/team/${item.id}`, { method: "PUT", body: group })).data.fields.kind, "This cannot change.");

    const list = await call("/api/admin/team?kind=person");
    assert.ok(list.data.items.some((row) => row.id === item.id));
    assert.ok(list.data.items.every((row) => row.kind === "person"));
  });

  test("reorder writes steps of 10 and refuses bad lists (BR-2)", async () => {
    const award = (n) => ({ issuer: `zz-Award ${n}`, line: "", image: null, year: null });
    const a = await make("awards", award(1));
    const b = await make("awards", award(2));
    const c = await make("awards", award(3));
    const done = await call("/api/admin/awards/reorder", { method: "POST", body: { ids: [c.id, a.id, b.id] } });
    assert.equal(done.status, 200);
    assert.deepEqual(done.data.items.map((row) => [row.id, row.sortOrder]), [[c.id, 10], [a.id, 20], [b.id, 30]]);
    assert.equal((await call("/api/admin/awards/reorder", { method: "POST", body: { ids: [a.id, a.id] } })).status, 400);
    assert.equal((await call("/api/admin/awards/reorder", { method: "POST", body: { ids: [a.id, "f".repeat(24)] } })).status, 400);
    assert.equal((await call("/api/admin/awards/reorder", { method: "POST", body: { ids: [{ $ne: null }] } })).status, 400);
  });

  test("a section has a maximum number of live items (BR-4)", async () => {
    const live = (await call("/api/admin/news")).data.items.filter((row) => row.status === "published").length;
    for (let n = live; n < 6; n += 1) {
      const item = await make("news", await newsBody(n));
      assert.equal((await publish("news", item.id)).status, 200);
    }
    const extra = await make("news", await newsBody(99));
    const refused = await publish("news", extra.id);
    assert.equal(refused.status, 409);
    assert.equal(refused.data.error, "Only 6 news items can be live. Unpublish one first.");
  });

  test("taking the last live item off asks first (BR-4)", async (t) => {
    const others = (await call("/api/admin/testimonials")).data.items.filter((row) => row.status === "published");
    if (others.length) {
      t.skip("parent voices already has live items; the guard only applies to the last one");
      return;
    }
    const voice = await make("testimonials", {
      highlight: "zz-it made our son confident and happy.",
      quote: "q".repeat(60),
      name: "zz-Parent",
      role: "Mother of Riaan, Nursery",
      photo: await upload("voice", 1280, 800),
    });
    assert.equal((await publish("testimonials", voice.id)).status, 200);
    const asked = await unpublish("testimonials", voice.id);
    assert.equal(asked.status, 409);
    assert.equal(asked.data.needsConfirm, true);
    assert.equal(asked.data.error, "This hides the section on the website.");
    assert.equal((await unpublish("testimonials", voice.id, { hideSection: true })).status, 200);
  });

  test("replaced and deleted images are retired (BR-8)", async () => {
    const first = await freshUpload("teamGroup", 1600, 1000);
    const item = await make("team", { kind: "group", name: "zz-Group", line: "", photo: first });
    const second = await freshUpload("teamGroup", 1600, 1000);
    await call(`/api/admin/team/${item.id}`, { method: "PUT", body: { kind: "group", name: "zz-Group", line: "", photo: second } });
    assert.equal((await fetch(base + first.url)).status, 404, "old photo removed");
    assert.equal((await fetch(base + second.url)).status, 200);
    assert.equal((await call(`/api/admin/team/${item.id}`, { method: "DELETE" })).status, 200);
    assert.equal((await fetch(base + second.url)).status, 404, "photo removed with the item");
    for (const variant of second.variants) assert.equal((await fetch(base + variant.url)).status, 404);
    cleanup.splice(cleanup.findIndex(([, row]) => row.id === item.id), 1);
  });
});

describe("programs", { concurrency: false }, () => {
  test("slugs are unique and delete needs the typed slug (BR-9)", async () => {
    const program = await make("programs", { slug: "zz-sunbeam", name: "zz-Sunbeam", learn: [], skills: [], ratio: { adults: 1, children: 8 }, accent: "yellow", pageAgeLabel: "", pageLine: "", pageAccent: "orange", cardPhoto: null, photo: null, seo: { metaTitle: "", metaDescription: "" }, ageLabel: "", shortAge: "", line: "", longDescription: "" });
    const twin = await call("/api/admin/programs", { method: "POST", body: { ...program, id: undefined } });
    assert.equal(twin.status, 400, "id/status/timestamps are not accepted in a body");
    const dup = await call("/api/admin/programs", {
      method: "POST",
      body: { slug: "zz-sunbeam", name: "Again", learn: [], skills: [], ratio: { adults: 1, children: 8 }, accent: "yellow", pageAgeLabel: "", pageLine: "", pageAccent: "orange", cardPhoto: null, photo: null, seo: { metaTitle: "", metaDescription: "" }, ageLabel: "", shortAge: "", line: "", longDescription: "" },
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.fields.slug, "This slug is already used.");

    const noConfirm = await call(`/api/admin/programs/${program.id}`, { method: "DELETE" });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.data.error, "Type zz-sunbeam to confirm.");
    assert.equal((await call(`/api/admin/programs/${program.id}?confirm=zz-sunbea`, { method: "DELETE" })).status, 400);
    assert.equal((await call(`/api/admin/programs/${program.id}?confirm=zz-sunbeam`, { method: "DELETE" })).status, 200);
    cleanup.splice(cleanup.findIndex(([, row]) => row.id === program.id), 1);
  });
});

describe("blog", { concurrency: false }, () => {
  let category;
  let originalFeatured;

  before(async () => {
    originalFeatured = await BlogPost.findOne({ featured: true }).select("_id").lean();
    const made = await call("/api/admin/blog-categories", { method: "POST", body: { slug: "zz-play", name: "zz-Play", accent: "turquoise" } });
    assert.equal(made.status, 201);
    category = made.data.item;
  });

  after(async () => {
    if (originalFeatured) await BlogPost.updateOne({ _id: originalFeatured._id }, { $set: { featured: true } });
    await BlogCategory.deleteOne({ slug: "zz-play" });
  });

  test("categories: unique slug, must exist on posts, cannot be deleted while used (BR-7)", async () => {
    const dup = await call("/api/admin/blog-categories", { method: "POST", body: { slug: "zz-play", name: "Again", accent: "coral" } });
    assert.equal(dup.status, 409);
    const missing = await call("/api/admin/blog-posts", { method: "POST", body: await postBody("f".repeat(24), "nocat") });
    assert.equal(missing.status, 400);
    assert.equal(missing.data.fields.category, "Choose a category.");

    const post = await make("blog-posts", await postBody(category.id, "cat"));
    const blocked = await call(`/api/admin/blog-categories/${category.id}`, { method: "DELETE" });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.data.error, "Move its posts to another category first.");

    const renamed = await call(`/api/admin/blog-categories/${category.id}`, { method: "PUT", body: { slug: "zz-play", name: "zz-Play time", accent: "turquoise" } });
    assert.equal(renamed.status, 200);
    const listed = await call(`/api/admin/blog-posts?q=${encodeURIComponent(post.slug)}`);
    assert.equal(listed.data.items[0].category.name, "zz-Play time", "posts read the new name");
    const counts = await call("/api/admin/blog-categories");
    assert.equal(counts.data.items.find((row) => row.id === category.id).posts, 1);
  });

  test("posts: inline HTML is cleaned, publish fills the date, list has no blocks", async () => {
    const post = await make("blog-posts", await postBody(category.id, "clean"));
    assert.equal(post.blocks[0].text, "Play is <strong>serious</strong> work.");
    const live = await publish("blog-posts", post.id);
    assert.equal(live.status, 200, JSON.stringify(live.data));
    assert.ok(live.data.item.publishedAt, "publishedAt is set on publish");

    const list = await call(`/api/admin/blog-posts?q=zz-post-clean&status=published&category=${category.id}`);
    assert.equal(list.data.total, 1);
    assert.equal(list.data.items[0].blocks, undefined);
    assert.ok(Array.isArray(list.data.items[0].seoIssues));
    assert.ok(list.data.items[0].seoIssues.includes("Search title is over 60 characters.") === false);
    const regex = await call("/api/admin/blog-posts?q=.*");
    assert.equal(regex.status, 200, "search text is escaped");
    assert.equal((await call("/api/admin/blog-posts?category[$ne]=x")).status, 200, "operator objects are ignored");
  });

  test("featured: one at a time, published only (BR-5)", async () => {
    const a = await make("blog-posts", await postBody(category.id, "fa"));
    const b = await make("blog-posts", await postBody(category.id, "fb"));
    const early = await call(`/api/admin/blog-posts/${a.id}/flags`, { method: "PATCH", body: { featured: true } });
    assert.equal(early.status, 409);
    assert.equal(early.data.error, "Publish the post first.");

    await publish("blog-posts", a.id);
    await publish("blog-posts", b.id);
    assert.equal((await call(`/api/admin/blog-posts/${a.id}/flags`, { method: "PATCH", body: { featured: true } })).data.item.featured, true);
    assert.equal((await call(`/api/admin/blog-posts/${b.id}/flags`, { method: "PATCH", body: { featured: true } })).data.item.featured, true);
    assert.equal(await BlogPost.countDocuments({ featured: true }), 1);
    assert.equal((await BlogPost.findById(b.id).lean()).featured, true);

    // Unpublishing clears the flag.
    assert.equal((await unpublish("blog-posts", b.id)).data.item.featured, false);
    assert.equal((await call(`/api/admin/blog-posts/${a.id}/flags`, { method: "PATCH", body: {} })).status, 400);
  });

  test("trending: max 6, places 1–6, swaps, cleared on unpublish (BR-6)", async () => {
    const existing = await BlogPost.countDocuments({ trending: true });
    const free = 6 - existing;
    const posts = [];
    for (let n = 0; n <= free; n += 1) {
      const post = await make("blog-posts", await postBody(category.id, `t${n}`));
      await publish("blog-posts", post.id);
      posts.push(post);
    }
    for (const post of posts.slice(0, free)) {
      const marked = await call(`/api/admin/blog-posts/${post.id}/flags`, { method: "PATCH", body: { trending: true } });
      assert.equal(marked.status, 200);
      assert.ok(marked.data.item.trendingOrder >= 1 && marked.data.item.trendingOrder <= 6);
    }
    const seventh = await call(`/api/admin/blog-posts/${posts[free].id}/flags`, { method: "PATCH", body: { trending: true } });
    assert.equal(seventh.status, 409);
    assert.equal(seventh.data.error, "Remove a trending post first.");

    if (free >= 2) {
      const [first, second] = posts;
      const before1 = (await BlogPost.findById(first.id).lean()).trendingOrder;
      const before2 = (await BlogPost.findById(second.id).lean()).trendingOrder;
      const swapped = await call(`/api/admin/blog-posts/${first.id}/flags`, { method: "PATCH", body: { trendingOrder: before2 } });
      assert.equal(swapped.status, 200);
      assert.equal((await BlogPost.findById(first.id).lean()).trendingOrder, before2);
      assert.equal((await BlogPost.findById(second.id).lean()).trendingOrder, before1);
    }
    const orders = (await BlogPost.find({ trending: true }).lean()).map((post) => post.trendingOrder);
    assert.equal(new Set(orders).size, orders.length, "no two posts share a place");
    assert.ok(orders.length <= 6);

    const cleared = await unpublish("blog-posts", posts[0].id);
    assert.equal(cleared.data.item.trending, false);
    assert.equal(cleared.data.item.trendingOrder, null);
    const draftOrder = await call(`/api/admin/blog-posts/${posts[0].id}/flags`, { method: "PATCH", body: { trendingOrder: 2 } });
    assert.equal(draftOrder.status, 409);
  });

  test("blog posts cannot be reordered by hand", async () => {
    assert.equal((await call("/api/admin/blog-posts/reorder", { method: "POST", body: { ids: ["a".repeat(24)] } })).status, 404);
  });
});

describe("page SEO and site settings", { concurrency: false }, () => {
  let savedAbout;
  let savedSite;

  before(async () => {
    savedAbout = await PageSeo.findOne({ pageKey: "about" }).lean();
    savedSite = await SiteSettings.findOne({ key: "site" }).lean();
  });

  after(async () => {
    if (savedAbout) await PageSeo.replaceOne({ pageKey: "about" }, savedAbout);
    else await PageSeo.deleteOne({ pageKey: "about" });
    if (savedSite) await SiteSettings.replaceOne({ key: "site" }, savedSite);
    else await SiteSettings.deleteOne({ key: "site" });
  });

  test("pages: fixed list, sections per page, read-only path, health flags (SEO-5)", async () => {
    const list = await call("/api/admin/page-seo");
    assert.equal(list.data.items.length, 15);
    assert.ok(list.data.items.every((row) => Array.isArray(row.seoIssues) && row.path.startsWith("/")));
    assert.equal((await call("/api/admin/page-seo/secret")).status, 404);

    const currentImage = (await call("/api/admin/page-seo/about")).data.item.seo.ogImage || null;
    const body = {
      seo: {
        ogImage: currentImage,
        metaTitle: "About Little Elly — Our Team & Awards",
        metaDescription: "Twenty years, 172+ preschools and one belief: a child who feels loved and safe will learn anything.",
        keywords: ["preschool", "Preschool", "little elly"],
        robots: "index,follow",
      },
      sections: {
        team: { kicker: "Our team", headline: ["The people behind", "H . A . P . P . Y"] },
        awards: { kicker: "Awards & recognition", headline: ["Carving a brighter", "tomorrow."], lead: "Recognition, year after year." },
      },
    };
    const saved = await call("/api/admin/page-seo/about", { method: "PUT", body });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.item.path, "/about-us/");
    assert.deepEqual(saved.data.item.seo.keywords, ["preschool", "little elly"]);
    assert.equal((await call("/api/admin/page-seo/about", { method: "PUT", body: { ...body, path: "/x/" } })).status, 400);
    assert.equal((await call("/api/admin/page-seo/about", { method: "PUT", body: { ...body, sections: {} } })).status, 400);

    const health = (await call("/api/admin/page-seo")).data.items.find((row) => row.pageKey === "about");
    assert.ok(!health.seoIssues.includes("Add a search description."));
  });

  test("site settings save and validate", async () => {
    // Keep the real logo and share image: saving without them would (correctly) delete their files.
    const current = (await call("/api/admin/site-settings")).data.item;
    const keep = (image) => (image ? { ...image } : null);
    const body = {
      siteName: "Little Elly",
      siteOrigin: "https://littleelly.com/",
      defaultShareImage: keep(current.defaultShareImage),
      organization: {
        legalName: "Little Elly Preschool",
        logo: keep(current.organization?.logo),
        phone: "",
        email: "",
        sameAs: ["https://www.instagram.com/littleelly_preschool/"],
      },
    };
    const saved = await call("/api/admin/site-settings", { method: "PUT", body });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.item.siteOrigin, "https://littleelly.com");
    assert.equal((await call("/api/admin/site-settings", { method: "PUT", body: { ...body, siteOrigin: "javascript:alert(1)" } })).status, 400);
    assert.equal((await call("/api/admin/site-settings")).data.item.siteName, "Little Elly");
  });

  test("one section heading saves on its own (§4.4)", async () => {
    const before = (await call("/api/admin/page-seo/about")).data.item.sections.team;
    const body = { kicker: "Our team", headline: ["zz-The people", "behind it all"] };
    const saved = await call("/api/admin/page-seo/about/sections/team", { method: "PATCH", body });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.deepEqual(saved.data.item.sections.team, body);
    assert.ok(saved.data.item.sections.awards, "other sections are untouched");
    assert.equal((await call("/api/admin/page-seo/about/sections/team", { method: "PATCH", body: { ...body, headline: ["One"] } })).status, 400);
    assert.equal((await call("/api/admin/page-seo/about/sections/hero", { method: "PATCH", body })).status, 404);
    assert.equal((await call("/api/admin/page-seo/about/sections/__proto__", { method: "PATCH", body })).status, 404);
    assert.equal((await call("/api/admin/page-seo/curriculum/sections/team", { method: "PATCH", body })).status, 404);
    await call("/api/admin/page-seo/about/sections/team", { method: "PATCH", body: before });
  });

  test("image place rules for the upload fields (IMG-7)", async () => {
    const { data } = await call("/api/admin/image-slots");
    assert.equal(data.slots.teamPerson.help, "3:4 portrait · min 768 × 1024 px · JPG, PNG or WebP · max 8 MB");
    assert.equal(data.slots.award.ratio, null);
    assert.equal(data.maxBytes, 8 * 1024 * 1024);
  });

  test("dashboard counts and recent items (UI-9)", async () => {
    const stats = await call("/api/admin/content-stats");
    assert.equal(stats.status, 200);
    assert.deepEqual(stats.data.counts.map((row) => row.key), ["team", "awards", "programs", "testimonials", "news", "blog-posts"]);
    assert.ok(stats.data.recent.length <= 5);
  });
});
