/**
 * End-to-end acceptance (CONTENT_CMS_SPEC.md §13): changes made through the CMS admin
 * API must show on the public website's server-rendered HTML.
 *
 * Needs the CMS API (:3001) and the website (:5174, SITE_BASE) running.
 * Run with: npm run test:e2e   (about 2 minutes: the site keeps CMS answers for 60 s)
 *
 * Everything created starts with "zz-" and is deleted again; the award order is restored.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import mongoose from "mongoose";
import sharp from "sharp";
import { env } from "../src/config/env.js";
import { COOKIE, signAdmin } from "../src/lib/tokens.js";
import { AdminUser } from "../src/models/AdminUser.js";

const CMS = process.env.CMS_BASE || "http://localhost:3001";
const SITE = process.env.SITE_BASE || "http://localhost:5174";
const SITE_CACHE_MS = 61_000;
let cookie = "";
const made = [];
const uploads = [];
let awardOrder = [];
let html = {};

async function call(path, { method = "GET", body } = {}) {
  const headers = { origin: "http://localhost:5173", cookie };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(CMS + path, { method, headers, body: payload });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : {} };
}

async function upload(slot, width, height, alt) {
  const buffer = await sharp({ create: { width, height, channels: 3, background: "#ffd541" } }).jpeg().toBuffer();
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "image/jpeg" }), "x.jpg");
  form.append("slot", slot);
  const { status, data } = await call("/api/admin/uploads", { method: "POST", body: form });
  assert.equal(status, 201, JSON.stringify(data));
  uploads.push(data.image.filename);
  return { ...data.image, alt };
}

async function create(resource, body, publish = true) {
  const created = await call(`/api/admin/${resource}`, { method: "POST", body });
  assert.equal(created.status, 201, `${resource}: ${JSON.stringify(created.data)}`);
  made.push([resource, created.data.item]);
  if (publish) {
    const live = await call(`/api/admin/${resource}/${created.data.item.id}/status`, { method: "PATCH", body: { status: "published" } });
    assert.equal(live.status, 200, `${resource} publish: ${JSON.stringify(live.data)}`);
  }
  return created.data.item;
}

async function page(path) {
  const response = await fetch(SITE + path);
  return { status: response.status, body: await response.text() };
}

const seo = (extra = {}) => ({ metaTitle: "", metaDescription: "", keywords: [], canonicalUrl: "", robots: "index,follow", ogImage: null, schemaJsonLd: "", ...extra });

before(async () => {
  for (const [name, url] of [["CMS", `${CMS}/api/health`], ["website", `${SITE}/`]]) {
    const ok = await fetch(url).then((r) => r.ok).catch(() => false);
    assert.ok(ok, `Start the ${name} first (${url}).`);
  }
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  const admin = await AdminUser.findOne({ email: env.adminEmail }).select("+tokenVersion").lean();
  await mongoose.disconnect();
  cookie = `${COOKIE}=${signAdmin(admin)}`;

  // ---- remove anything an earlier, interrupted run left behind
  for (const resource of ["team", "programs", "testimonials", "news"]) {
    for (const item of (await call(`/api/admin/${resource}`)).data.items) {
      const label = item.name || item.title || item.highlight || "";
      if (!/^zz-E2E/.test(label) && !/^zz-e2e/.test(item.slug || "")) continue;
      const query = new URLSearchParams({ hideSection: "true", ...(item.slug ? { confirm: item.slug } : {}) });
      await call(`/api/admin/${resource}/${item.id}?${query}`, { method: "DELETE" });
    }
  }
  for (const item of (await call("/api/admin/blog-posts?q=zz-e2e")).data.items) {
    await call(`/api/admin/blog-posts/${item.id}?confirm=${item.slug}`, { method: "DELETE" });
  }

  // ---- make every change through the admin API
  const person = await upload("teamPerson", 900, 1200, "Test person portrait");
  await create("team", { kind: "person", name: "zz-E2E Live Person", role: "Teacher", note: "<img src=x onerror=alert(1)> Loves stories", photo: person });
  await create("team", { kind: "person", name: "zz-E2E Draft Person", role: "Teacher", note: "", photo: person }, false);

  const awards = (await call("/api/admin/awards")).data.items;
  awardOrder = awards.map((a) => a.id);
  const reversed = awardOrder.slice().reverse();
  assert.equal((await call("/api/admin/awards/reorder", { method: "POST", body: { ids: reversed } })).status, 200);

  const program = {
    name: "zz-E2E Sunbeam",
    ageLabel: "6 years +",
    shortAge: "6y+",
    line: "A gentle bridge to big school.",
    longDescription: "A calm, structured year that turns curiosity into steady habits for reading, numbers and friendship.",
    learn: ["Reading aloud with confidence", "Numbers to one hundred", "Working in small teams"],
    skills: ["Phonics", "Logic", "Story time", "Art"],
    ratio: { adults: 2, children: 16 },
    accent: "cyan",
    pageAgeLabel: "6 years and up",
    pageLine: "Big school, gently prepared.",
    pageAccent: "orange",
    cardPhoto: await upload("programCard", 1000, 1000, "Sunbeam children"),
    photo: await upload("programDetail", 1024, 768, "Sunbeam classroom"),
    seo: seo({ metaTitle: "Sunbeam Program (6+) | Little Elly", metaDescription: "Sunbeam at Little Elly is a calm, structured year that turns curiosity into steady habits." }),
  };
  await create("programs", { ...program, slug: "zz-e2e-sunbeam" });
  await create("programs", { ...program, slug: "zz-e2e-draft-program", name: "zz-E2E Draft" }, false);

  await create("testimonials", {
    lead: "I am glad I chose Little Elly because",
    highlight: "zz-E2E our daughter now sings all the way home.",
    quote: "q".repeat(60),
    name: "zz-E2E Parent",
    role: "Mother of Mira, Nursery",
    photo: await upload("voice", 1280, 800, "Parent and child"),
  });

  await create("news", {
    tag: "Workshop",
    title: "zz-E2E Parents' morning",
    line: "A short morning for parents to see a day in class.",
    accent: "turquoise",
    image: await upload("news", 1280, 720, "Parents in class"),
    eventDate: null,
    link: "/admissions/",
  });

  const category = (await call("/api/admin/blog-categories")).data.items[0];
  const cover = await upload("blogCover", 1600, 900, "Story cover");
  const post = (slug, extra) => ({
    slug,
    title: `zz-E2E story ${slug.slice(-6)} about play and learning`,
    excerpt: "A short summary of the story that is long enough to pass the excerpt rule easily.",
    category: category.id,
    author: "zz-E2E Author",
    publishedAt: null,
    coverImage: cover,
    blocks: [{ type: "p", text: "Play is <strong>serious</strong> work." }],
    seo: seo(extra),
  });
  await create(
    "blog-posts",
    post("zz-e2e-seo-post", {
      metaTitle: "Play Matters | Little Elly",
      metaDescription: "Why play is serious work for children, and how a good preschool builds it into every day.",
      keywords: ["play based learning", "preschool"],
      canonicalUrl: "https://littleelly.com/blogs/zz-e2e-seo-post",
      schemaJsonLd: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", name: "</script><script>alert(1)</script>" }),
    }),
  );
  await create("blog-posts", post("zz-e2e-hidden-post", { robots: "noindex,nofollow" }));

  // ---- the website keeps CMS answers for 60 s
  await new Promise((resolve) => setTimeout(resolve, SITE_CACHE_MS));
  for (const path of ["/", "/about-us/", "/blogs/", "/our-programs/", "/our-programs/zz-e2e-sunbeam/", "/our-programs/zz-e2e-draft-program/", "/blogs/zz-e2e-seo-post", "/blogs/zz-e2e-hidden-post", "/cms-sitemap.xml"]) {
    html[path] = await page(path);
  }
});

after(async () => {
  for (const [resource, item] of made.reverse()) {
    const query = new URLSearchParams({ hideSection: "true" });
    if (item.slug) query.set("confirm", item.slug);
    await call(`/api/admin/${resource}/${item.id}?${query}`, { method: "DELETE" });
  }
  if (awardOrder.length) await call("/api/admin/awards/reorder", { method: "POST", body: { ids: awardOrder } });
  for (const filename of uploads) await call(`/api/admin/uploads/${filename}`, { method: "DELETE" });
});

describe("CMS changes reach the website (§13)", () => {
  test("1. a live team member shows on /about-us/; a draft does not", () => {
    const body = html["/about-us/"].body;
    assert.match(body, /zz-E2E Live Person/);
    assert.doesNotMatch(body, /zz-E2E Draft Person/);
  });

  test("2. reordering awards changes the carousel order", async () => {
    const { data } = await call("/api/public/about");
    // React separates text parts with <!-- --> in server HTML.
    const body = html["/about-us/"].body.replace(/<!-- -->/g, "");
    const count = String(data.awards.length).padStart(2, "0");
    assert.match(body, new RegExp(`Award\\s*01\\s*of\\s*${count}`));
    // The reversed order: the award that was last is now shown first.
    const start = body.indexOf('id="awards"');
    const shown = body.slice(start).match(/<h3[^>]*>([^<]+)<\/h3>/)?.[1];
    assert.equal(shown, data.awards[0].issuer, "first award after reorder is shown");
  });

  test("3. a 6th program joins the carousel and has its own page; a draft program is 404", () => {
    const home = html["/"].body;
    assert.match(home, /zz-E2E Sunbeam/);
    assert.match(home, /width:16\.66/, "six rail labels share the width");
    const detail = html["/our-programs/zz-e2e-sunbeam/"];
    assert.equal(detail.status, 200);
    for (const text of ["zz-E2E Sunbeam", "6 years and up", "Big school, gently prepared.", "Reading aloud with confidence", "Phonics", "2 : 16"]) {
      assert.ok(detail.body.includes(text), `program page shows ${text}`);
    }
    assert.match(detail.body, /<title>Sunbeam Program \(6\+\) \| Little Elly<\/title>/);
    assert.match(detail.body, /"@type":"BreadcrumbList"/);
    assert.equal(html["/our-programs/zz-e2e-draft-program/"].status, 404);
    assert.match(html["/our-programs/"].body, /zz-E2E Sunbeam/, "programs page lists it");
  });

  test("4. a new parent voice is on the home page", () => {
    assert.match(html["/"].body, /zz-E2E our daughter now sings all the way home\./);
  });

  test("5. a news item shows in a 16:9 frame and links where it says", () => {
    const home = html["/"].body;
    const at = home.indexOf("zz-E2E Parents");
    assert.ok(at > 0);
    const card = home.slice(Math.max(0, home.lastIndexOf("<a", at)), at);
    assert.match(card, /href="\/admissions\/"/);
    assert.match(card, /aspect-\[16\/9\]/);
  });

  test("6. /blogs/ renders the featured post and the first page of stories with Show more", () => {
    const body = html["/blogs/"].body;
    assert.match(body, /Read the story/);
    assert.match(body, /Show more stories/);
  });

  test("8. post SEO is in the page source; Hide from search drops it from the sitemap", () => {
    const body = html["/blogs/zz-e2e-seo-post"].body;
    assert.match(body, /<title>Play Matters \| Little Elly<\/title>/);
    assert.match(body, /<meta name="description" content="Why play is serious work/);
    assert.match(body, /<meta name="keywords" content="play based learning, preschool"/);
    assert.match(body, /<link rel="canonical" href="https:\/\/littleelly\.com\/blogs\/zz-e2e-seo-post"/);
    assert.match(body, /<meta name="robots" content="index, follow"/);
    assert.match(body, /<meta property="og:type" content="article"/);
    assert.match(body, /"@type":"BlogPosting"/);
    assert.match(body, /"@type":"FAQPage"/);
    const hidden = html["/blogs/zz-e2e-hidden-post"].body;
    assert.match(hidden, /<meta name="robots" content="noindex, nofollow"/);
    const sitemap = html["/cms-sitemap.xml"].body;
    assert.match(sitemap, /zz-e2e-seo-post/);
    assert.doesNotMatch(sitemap, /zz-e2e-hidden-post/);
    assert.doesNotMatch(sitemap, /zz-e2e-draft-program/);
  });

  test("9. stored script or HTML renders as text, never runs", () => {
    const about = html["/about-us/"].body;
    assert.doesNotMatch(about, /<img src=x onerror/i);
    const post = html["/blogs/zz-e2e-seo-post"].body;
    assert.doesNotMatch(post, /<\/script><script>alert\(1\)/);
    assert.match(post, /\\u003c\/script\\u003e/, "JSON-LD escapes < and >");
  });
});
