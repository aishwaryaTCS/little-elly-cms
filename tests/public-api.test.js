/**
 * Phase 3 tests: public content API (CONTENT_CMS_SPEC.md §9.2) and the CMS blog
 * preview (BL-7). Needs the CMS running. Test records start with "zz-" and
 * are removed afterwards; the featured flag is restored.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { COOKIE, signAdmin } from "../src/lib/tokens.js";
import { AdminUser } from "../src/models/AdminUser.js";
import { Award, BlogCategory, BlogPost, NewsItem, Program, TeamMember, Testimonial } from "../src/models/content.js";

const base = process.env.CMS_BASE || "http://localhost:3001";
let cookie = "";
let category;
let otherCategory;
let originalFeatured;
const posts = [];

async function get(path) {
  const response = await fetch(base + path);
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : {}, headers: response.headers };
}

function image(slot, width, height) {
  const id = "00000000-0000-4000-8000-000000000000";
  return {
    storage: "local",
    key: `${id}.webp`,
    url: `/media/${id}.webp`,
    filename: `${id}.webp`,
    contentType: "image/webp",
    slot,
    width,
    height,
    variants: [{ width, url: `/media/${id}.webp` }],
    alt: "Children at Little Elly",
  };
}

/** Fails if any key the website must never see appears anywhere in the body. */
const FORBIDDEN = ["_id", "__v", "status", "storage", "key", "filename", "sortOrder", "featured", "trending", "trendingOrder", "createdAt", "passwordHash", "tokenVersion"];
function assertClean(value, where, path = "") {
  if (Array.isArray(value)) return value.forEach((item, index) => assertClean(item, where, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [name, inner] of Object.entries(value)) {
    // Top-level keys are response list names (e.g. `featured`, `trending` lists of cards), not record fields.
    if (path !== "") assert.ok(!FORBIDDEN.includes(name), `${where}: ${path}.${name} must not be public`);
    if (name !== "schemaJsonLd") assertClean(inner, where, `${path}.${name}`);
  }
}

const day = (n) => new Date(Date.UTC(2026, 0, 1 + n));

before(async () => {
  const health = await fetch(`${base}/api/health`).catch(() => null);
  assert.ok(health?.ok, "Start the CMS API (npm run dev) before these tests.");
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const admin = await AdminUser.findOne({ email: env.adminEmail }).select("+tokenVersion").lean();
  cookie = `${COOKIE}=${signAdmin(admin)}`;

  originalFeatured = await BlogPost.findOne({ featured: true }).select("_id").lean();
  category = await BlogCategory.create({ slug: "zz-play", name: "zz-Play", accent: "coral", sortOrder: 9990 });
  otherCategory = await BlogCategory.create({ slug: "zz-quiet", name: "zz-Quiet", accent: "cyan", sortOrder: 9991 });
  await BlogCategory.create({ slug: "zz-empty", name: "zz-Empty", accent: "pink", sortOrder: 9992 });

  await TeamMember.create([
    { kind: "person", name: "zz-Live person", role: "Teacher", photo: image("teamPerson", 900, 1200), status: "published", sortOrder: 9990 },
    { kind: "person", name: "zz-Draft person", role: "Teacher", status: "draft", sortOrder: 9991 },
    { kind: "group", name: "zz-Live group", photo: image("teamGroup", 1600, 1000), status: "published", sortOrder: 9992 },
  ]);
  await Award.create([
    { issuer: "zz-Live award", line: "A line about it.", image: image("award", 1000, 1400), status: "published", sortOrder: 9990 },
    { issuer: "zz-Draft award", status: "draft" },
  ]);
  await Program.create([
    {
      slug: "zz-live-program",
      name: "zz-Sunbeam",
      ageLabel: "6 years +",
      shortAge: "6y+",
      line: "A gentle bridge to big school.",
      longDescription: "Long description.",
      learn: ["a", "b", "c"],
      skills: ["w", "x", "y", "z"],
      ratio: { adults: 2, children: 15 },
      accent: "turquoise",
      cardPhoto: image("programCard", 1000, 1000),
      photo: image("programDetail", 1600, 1200),
      seo: { metaTitle: "", schemaJsonLd: '{"@context":"https://schema.org","@type":"Course","name":"Sunbeam"}' },
      status: "published",
      sortOrder: 9990,
    },
    { slug: "zz-draft-program", name: "zz-Draft program", status: "draft" },
    { slug: "zz-hidden-program", name: "zz-Hidden", status: "published", seo: { robots: "noindex,nofollow" }, sortOrder: 9991 },
  ]);
  await Testimonial.create([
    { highlight: "zz-live voice", quote: "q", name: "zz-Parent", role: "Mother", status: "published", sortOrder: 9990 },
    { highlight: "zz-draft voice", status: "draft" },
  ]);
  await NewsItem.create({ tag: "Event", title: "zz-Live news", line: "Line", accent: "orange", status: "published", sortOrder: 9990 });

  // 12 live posts in zz-play (newest = zz-p11), 2 in zz-quiet, 1 draft, 1 hidden from search.
  for (let n = 0; n < 12; n += 1) {
    posts.push(
      await BlogPost.create({
        slug: `zz-p${n}`,
        title: n === 5 ? "zz-Post about sandpits and [brackets]" : `zz-Post number ${n}`,
        excerpt: `Excerpt ${n}`,
        category: category._id,
        author: "zz-Author",
        publishedAt: day(n),
        coverImage: image("blogCover", 1600, 900),
        blocks: [
          { type: "p", text: "Hello <strong>there</strong>" },
          { type: "image", image: image("blogInline", 1600, 900) },
        ],
        status: "published",
      }),
    );
  }
  await BlogPost.create([
    { slug: "zz-q0", title: "zz-Quiet one", excerpt: "e", category: otherCategory._id, publishedAt: day(20), status: "published" },
    { slug: "zz-q1", title: "zz-Quiet two", excerpt: "e", category: otherCategory._id, publishedAt: day(21), status: "published", seo: { robots: "noindex,nofollow" } },
    { slug: "zz-draft-post", title: "zz-Draft post", excerpt: "e", category: category._id, status: "draft" },
  ]);

  // Feature an older zz post so we can see it leave the grid.
  await BlogPost.updateMany({ featured: true }, { $set: { featured: false } });
  await BlogPost.updateOne({ slug: "zz-p3" }, { $set: { featured: true } });
});

after(async () => {
  await Promise.all([
    TeamMember.deleteMany({ name: /^zz-/ }),
    Award.deleteMany({ issuer: /^zz-/ }),
    Program.deleteMany({ slug: /^zz-/ }),
    Testimonial.deleteMany({ highlight: /^zz-/ }),
    NewsItem.deleteMany({ title: /^zz-/ }),
    BlogPost.deleteMany({ slug: /^zz-/ }),
    BlogCategory.deleteMany({ slug: /^zz-/ }),
  ]);
  if (originalFeatured) await BlogPost.updateOne({ _id: originalFeatured._id }, { $set: { featured: true } });
  await mongoose.disconnect();
});

describe("public content", { concurrency: false }, () => {
  test("drafts never reach the public responses (BR-1)", async () => {
    const about = await get("/api/public/about");
    const names = about.data.people.map((p) => p.name);
    assert.ok(names.includes("zz-Live person"));
    assert.ok(!names.includes("zz-Draft person"));
    assert.ok(about.data.groups.some((g) => g.name === "zz-Live group"));
    assert.ok(about.data.awards.some((a) => a.issuer === "zz-Live award"));
    assert.ok(!about.data.awards.some((a) => a.issuer === "zz-Draft award"));

    const home = await get("/api/public/home");
    assert.ok(home.data.programs.some((p) => p.slug === "zz-live-program"));
    assert.ok(!home.data.programs.some((p) => p.slug === "zz-draft-program"));
    assert.ok(home.data.testimonials.some((v) => v.highlight === "zz-live voice"));
    assert.ok(!home.data.testimonials.some((v) => v.highlight === "zz-draft voice"));
    assert.ok(home.data.news.length <= 6);

    assert.equal((await get("/api/public/programs/zz-draft-program")).status, 404);
    assert.equal((await get("/api/public/blogs/zz-draft-post")).status, 404);
    const all = await get("/api/public/blogs?limit=24&q=zz-Draft");
    assert.equal(all.data.total, 0);
  });

  test("responses carry only the fields the site uses", async () => {
    for (const path of [
      "/api/public/site",
      "/api/public/about",
      "/api/public/home",
      "/api/public/programs",
      "/api/public/programs/zz-live-program",
      "/api/public/blogs?category=zz-play",
      "/api/public/blogs/zz-p5",
      "/api/public/sitemap",
    ]) {
      const response = await get(path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("cache-control"), "no-store", path);
      assertClean(response.data, path);
    }
    const home = await get("/api/public/home");
    const card = home.data.programs.find((p) => p.slug === "zz-live-program");
    assert.equal(card.longDescription, undefined, "home cards stay small");
    assert.deepEqual(Object.keys(card.cardPhoto).sort(), ["alt", "height", "url", "variants", "width"]);
  });

  test("program detail: ratio label, SEO fallbacks, canonical, JSON-LD", async () => {
    const { status, data } = await get("/api/public/programs/zz-live-program");
    assert.equal(status, 200);
    const program = data.program;
    assert.equal(program.ratio.label, "2 : 15");
    assert.deepEqual(program.page, { ageLabel: "6 years +", line: "A gentle bridge to big school.", accent: "turquoise" }, "programs-page set falls back to the home set");
    const home = (await get("/api/public/home")).data.programs.find((p) => p.slug === "zz-live-program");
    assert.equal(home.page, undefined, "home cards carry only the home set");
    const seeded = (await get("/api/public/programs/playgroup")).data.program;
    if (seeded) assert.notEqual(seeded.page.accent, seeded.accent, "seeded Play Group keeps two colours");
    assert.equal(program.path, "/our-programs/zz-live-program/");
    assert.equal(program.seo.metaTitle, "zz-Sunbeam", "falls back to the name");
    assert.equal(program.seo.metaDescription, "A gentle bridge to big school.");
    assert.match(program.seo.canonicalUrl, /^https:\/\/.+\/our-programs\/zz-live-program\/$/);
    assert.equal(program.seo.ogImage.url, program.photo.url, "share image falls back to the photo");
    assert.deepEqual(program.seo.schemaJsonLd, { "@context": "https://schema.org", "@type": "Course", name: "Sunbeam" });
    for (const bad of ["ZZ-LIVE-PROGRAM%00", "..%2F..", "a".repeat(130), "zz_live"]) {
      assert.equal((await get(`/api/public/programs/${bad}`)).status, 404, bad);
    }
  });
});

describe("public blogs", { concurrency: false }, () => {
  test("featured post sits apart; the grid pages with Show more (BR-5, BL-10)", async () => {
    const first = await get("/api/public/blogs?category=zz-play&limit=5");
    assert.equal(first.data.featured.slug, "zz-p3");
    assert.deepEqual(first.data.posts.map((p) => p.slug), ["zz-p11", "zz-p10", "zz-p9", "zz-p8", "zz-p7"]);
    assert.equal(first.data.total, 11, "12 posts minus the featured one");
    assert.equal(first.data.hasMore, true);
    const third = await get("/api/public/blogs?category=zz-play&limit=5&page=3");
    assert.deepEqual(third.data.posts.map((p) => p.slug), ["zz-p0"]);
    assert.equal(third.data.hasMore, false);
    assert.equal(first.data.posts[0].blocks, undefined, "cards have no blocks");
  });

  test("search covers every post, including the featured one, and is escaped", async () => {
    const found = await get("/api/public/blogs?q=zz-Post%20number%203");
    assert.deepEqual(found.data.posts.map((p) => p.slug), ["zz-p3"], "featured post is searchable");
    const brackets = await get(`/api/public/blogs?q=${encodeURIComponent("[brackets]")}`);
    assert.deepEqual(brackets.data.posts.map((p) => p.slug), ["zz-p5"]);
    assert.equal((await get(`/api/public/blogs?q=${encodeURIComponent(".*")}`)).data.total, 0);
    const byCategory = await get("/api/public/blogs?q=zz-Quiet&limit=24");
    assert.ok(byCategory.data.posts.some((p) => p.slug === "zz-q0"), "category name matches");
    assert.equal((await get("/api/public/blogs?q[$ne]=x")).status, 200, "operator objects are ignored");
  });

  test("filters, limits and categories", async () => {
    assert.equal((await get("/api/public/blogs?category=no-such")).data.total, 0);
    assert.equal((await get("/api/public/blogs?category=zz-play&limit=99")).data.pageSize, 24);
    assert.equal((await get("/api/public/blogs?category=zz-play&limit=-4")).data.pageSize, 1);
    assert.equal((await get("/api/public/blogs?category=zz-play&page=abc")).data.page, 1);
    const slugs = (await get("/api/public/blogs")).data.categories.map((c) => c.slug);
    assert.ok(slugs.includes("zz-play") && slugs.includes("zz-quiet"));
    assert.ok(!slugs.includes("zz-empty"), "only categories with live posts");
  });

  test("detail: blocks in the site shape, related and trending (BL-12, BR-6)", async () => {
    const { data } = await get("/api/public/blogs/zz-p5");
    assert.equal(data.post.blocks[0].text, "Hello <strong>there</strong>");
    assert.deepEqual(Object.keys(data.post.blocks[1]).sort(), ["alt", "height", "src", "type", "variants", "width"]);
    assert.equal(data.post.seo.metaTitle, "zz-Post about sandpits and [brackets]");
    assert.equal(data.post.seo.ogImage.url, data.post.coverImage.url);
    assert.equal(data.post.category.slug, "zz-play");
    assert.ok(data.related.length <= 8);
    assert.ok(data.related.every((p) => p.slug !== "zz-p5"));
    assert.ok(data.related.slice(0, 8).every((p) => p.category?.slug === "zz-play"), "same category first");
    assert.ok(data.trending.length <= 6 && data.trending.every((p) => p.slug !== "zz-p5"));

    await BlogPost.updateOne({ slug: "zz-p0" }, { $set: { trending: true, trendingOrder: 6 } }).catch(() => {});
    const trending = (await get("/api/public/blogs/zz-p5")).data.trending;
    if (trending.some((p) => p.slug === "zz-p0")) assert.equal(trending.at(-1).slug, "zz-p0", "trending keeps its places");
    await BlogPost.updateOne({ slug: "zz-p0" }, { $set: { trending: false, trendingOrder: null } });
  });

  test("sitemap lists indexable live items only (SEO-4)", async () => {
    const paths = (await get("/api/public/sitemap")).data.entries.map((entry) => entry.path);
    assert.ok(paths.includes("/blogs/zz-p5"));
    assert.ok(paths.includes("/our-programs/zz-live-program/"));
    assert.ok(!paths.includes("/blogs/zz-q1"), "hidden from search");
    assert.ok(!paths.includes("/blogs/zz-draft-post"), "draft");
    assert.ok(!paths.includes("/our-programs/zz-hidden-program/"));
    assert.ok(!paths.includes("/our-programs/zz-draft-program/"));
  });
});

describe("CMS preview (BL-7)", { concurrency: false }, () => {
  async function preview(id, withCookie = true) {
    const headers = { origin: "http://localhost:5173" };
    if (withCookie) headers.cookie = cookie;
    const response = await fetch(`${base}/api/admin/blog-posts/${id}/preview`, { headers });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : {}, headers: response.headers };
  }

  test("admins see the last saved draft in the article shape", async () => {
    const draft = await BlogPost.findOne({ slug: "zz-draft-post" }).lean();
    const seen = await preview(draft._id);
    assert.equal(seen.status, 200);
    assert.equal(seen.data.status, "draft");
    assert.equal(seen.data.post.slug, "zz-draft-post");
    assert.ok(Array.isArray(seen.data.related) && Array.isArray(seen.data.trending));
    assert.ok(seen.data.related.every((p) => p.slug !== "zz-draft-post"));
    assert.match(seen.headers.get("x-robots-tag"), /noindex/);
    const { status, ...article } = seen.data;
    assertClean(article, "preview");

    // Same shape as the public article for a live post.
    const live = await BlogPost.findOne({ slug: "zz-p5" }).lean();
    const fromCms = (await preview(live._id)).data;
    const fromSite = (await get("/api/public/blogs/zz-p5")).data;
    assert.deepEqual(fromCms.post, fromSite.post);
  });

  test("preview needs an admin session and a real post", async () => {
    const draft = await BlogPost.findOne({ slug: "zz-draft-post" }).lean();
    assert.equal((await preview(draft._id, false)).status, 401);
    assert.equal((await preview("a".repeat(24))).status, 404);
    assert.equal((await preview("not-an-id")).status, 404);
    // No public way in.
    assert.equal((await get(`/api/public/preview/blogs?id=${draft._id}`)).status, 404);
  });
});
