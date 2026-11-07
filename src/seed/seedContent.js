/**
 * npm run seed:content — loads today's website content into the content
 * collections (CONTENT_CMS_SPEC.md SD-1..SD-3).
 *
 * Source: src/seed/content/site-content.json (a snapshot of little-elly-grow/src/content
 * and each route's head()), plus photos from the website's public/ folder
 * (SITE_PUBLIC_DIR, default ../little-elly-grow/public).
 *
 * Safe to run again:
 *  - a content type is loaded only while its collection is empty, so admin edits
 *    and deletions are never overwritten or brought back;
 *  - page SEO and site settings are added only where missing.
 *
 * Items that miss a publish rule are saved as drafts and listed. Photos that miss
 * their slot's size or shape are kept and flagged "needs replacing".
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { redact } from "../config/env.js";
import { retireIfUnused } from "../lib/images.js";
import { syncContentIndexes } from "../lib/indexes.js";
import { storeSlotImage } from "../lib/storage.js";
import { Award, BlogCategory, BlogPost, NewsItem, PageSeo, Program, SiteSettings, TeamMember, Testimonial } from "../models/content.js";
import { contentSchemas, PAGE_KEYS, PAGE_PATHS } from "../validation/content.js";

const DATA = JSON.parse(fs.readFileSync(new URL("./content/site-content.json", import.meta.url), "utf8"));
const SITE_PUBLIC = path.resolve(process.env.SITE_PUBLIC_DIR || "../little-elly-grow/public");
const AUTHOR = "Little Elly Team";

const report = { added: [], skipped: [], drafts: [], photos: [], pages: [] };
const imageCache = new Map();

/** "var(--coral)" → "coral" */
const accent = (value) => String(value || "").replace(/^var\(--(.+)\)$/, "$1");
const plain = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function shorten(text, max) {
  const clean = plain(text);
  if (clean.length <= max) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).trim().length > max) break;
    out = (out + sentence).trim() + " ";
  }
  out = out.trim();
  if (out.length >= Math.min(50, max)) return out;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/** Copies one site photo into a slot (once per file and slot), with alt text. */
async function photo(relative, slot, alt, label) {
  const cacheKey = `${relative}|${slot}`;
  if (!imageCache.has(cacheKey)) {
    const file = path.join(SITE_PUBLIC, relative.replace(/^\/+/, ""));
    if (!path.resolve(file).startsWith(SITE_PUBLIC)) throw new Error(`Photo outside the site folder: ${relative}`);
    if (!fs.existsSync(file)) {
      report.photos.push({ label, file: relative, problem: "File not found. Upload a photo in the CMS." });
      imageCache.set(cacheKey, null);
    } else {
      const { problem, ...image } = await storeSlotImage(fs.readFileSync(file), slot, { allowOffSize: true });
      if (problem) report.photos.push({ label, file: relative, problem });
      imageCache.set(cacheKey, image);
    }
  }
  const image = imageCache.get(cacheKey);
  return image ? { ...image, alt: plain(alt).slice(0, 125) } : null;
}

function firstIssue(error) {
  const issue = error.issues[0];
  return `${issue.path.join(".") || "item"}: ${issue.message}`;
}

/** A type is loaded only while its collection is empty (checked before any photo is copied). */
async function alreadyHas(Model, label) {
  if (!(await Model.estimatedDocumentCount())) return false;
  report.skipped.push(`${label}: already has content`);
  return true;
}

/**
 * Loads one content type. Each body is cleaned with the draft rules, then checked
 * with the publish rules to decide its status.
 */
async function seedList({ Model, type, label, rows, extra = () => ({}) }) {
  if (await alreadyHas(Model, label)) return [];
  const docs = [];
  for (const [index, row] of rows.entries()) {
    const draft = contentSchemas.draft[type].safeParse(row.body);
    if (!draft.success) {
      report.drafts.push({ label: `${label} · ${row.name}`, reason: `Not copied. ${firstIssue(draft.error)}` });
      continue;
    }
    const live = contentSchemas.publish[type].safeParse(row.body);
    if (!live.success) report.drafts.push({ label: `${label} · ${row.name}`, reason: `Saved as draft. ${firstIssue(live.error)}` });
    else if (row.keepDraft) report.drafts.push({ label: `${label} · ${row.name}`, reason: `Saved as draft. ${row.keepDraft}` });
    docs.push({
      ...draft.data,
      status: live.success && !row.keepDraft ? "published" : "draft",
      sortOrder: (index + 1) * 10,
      ...extra(row, live.success),
    });
  }
  try {
    const inserted = await Model.insertMany(docs);
    report.added.push(`${label}: ${inserted.length} (${inserted.filter((doc) => doc.status === "published").length} live)`);
    return inserted;
  } catch (error) {
    // Nothing half-done: drop what this type inserted and the photos only it used.
    await Model.deleteMany({ _id: { $in: (error.insertedDocs || []).map((doc) => doc._id) } });
    for (const doc of docs) for (const image of Object.values(doc).filter((v) => v?.filename)) await retireIfUnused(image);
    throw error;
  }
}

async function seedTeam() {
  if (await alreadyHas(TeamMember, "Team")) return;
  const { people, groups } = DATA.about.team;
  const rows = [];
  for (const person of people) {
    rows.push({
      name: person.name,
      body: {
        kind: "person",
        name: person.name,
        role: person.role,
        note: person.note || "",
        photo: await photo(person.photo, "teamPerson", `${person.name}, ${person.role}`, `Team · ${person.name}`),
      },
    });
  }
  for (const group of groups) {
    rows.push({
      name: group.name,
      body: {
        kind: "group",
        name: group.name,
        line: group.line || "",
        photo: await photo(group.photo, "teamGroup", group.name, `Team · ${group.name}`),
      },
    });
  }
  await seedList({ Model: TeamMember, type: "teamMember", label: "Team", rows });
}

async function seedAwards() {
  if (await alreadyHas(Award, "Awards")) return;
  const rows = [];
  for (const item of DATA.about.awards.items) {
    rows.push({
      name: item.issuer,
      body: {
        issuer: item.issuer,
        line: item.line,
        image: await photo(item.src, "award", `${item.issuer} award`, `Award · ${item.issuer}`),
        year: null,
      },
    });
  }
  await seedList({ Model: Award, type: "award", label: "Awards", rows });
}

async function seedPrograms() {
  if (await alreadyHas(Program, "Programs")) return;
  const details = new Map(DATA.programsPage.programs.items.map((item) => [item.id, item]));
  const steps = new Map(DATA.programsPage.hero.steps.map((step) => [step.id, step]));
  const rows = [];
  for (const card of DATA.home.programs.items) {
    const detail = details.get(card.id) || {};
    const file = DATA.photos.programs[card.id];
    const alt = `${card.name} children at Little Elly`;
    rows.push({
      name: card.name,
      body: {
        slug: card.id,
        name: card.name,
        ageLabel: card.age,
        shortAge: steps.get(card.id)?.age || card.age,
        line: card.line,
        longDescription: detail.long || "",
        learn: card.learn,
        skills: detail.skills || [],
        ratio: { adults: detail.ratio?.adults ?? 1, children: detail.ratio?.children ?? 10 },
        accent: accent(card.accent),
        pageAgeLabel: detail.age || card.age,
        pageLine: detail.line || card.line,
        pageAccent: accent(detail.accent || card.accent),
        cardPhoto: await photo(file, "programCard", alt, `Program · ${card.name} (card)`),
        photo: await photo(file, "programDetail", alt, `Program · ${card.name} (page)`),
        seo: {
          metaTitle: `${card.name} Program (${card.age}) | Little Elly`.slice(0, 60),
          metaDescription: shorten(detail.long || card.line, 160),
        },
      },
    });
  }
  await seedList({ Model: Program, type: "program", label: "Programs", rows });
}

async function seedVoices() {
  if (await alreadyHas(Testimonial, "Parent voices")) return;
  const rows = [];
  for (const voice of DATA.home.voices.items) {
    rows.push({
      name: voice.name,
      body: {
        lead: voice.lead,
        highlight: voice.highlight,
        quote: voice.quote,
        name: voice.name,
        role: voice.role,
        photo: await photo(voice.photo, "voice", `${voice.name}, ${voice.role}`, `Parent voice · ${voice.name}`),
      },
    });
  }
  await seedList({ Model: Testimonial, type: "testimonial", label: "Parent voices", rows });
}

async function seedNews() {
  if (await alreadyHas(NewsItem, "News & events")) return;
  // The site shows these photos in this order behind the news cards today.
  const files = [DATA.photos.hero2, DATA.photos.day.play, DATA.photos.day.learn, DATA.photos.why];
  const rows = [];
  for (const [index, item] of DATA.home.news.items.entries()) {
    rows.push({
      name: item.title,
      body: {
        tag: item.tag,
        title: item.title,
        line: item.line,
        accent: accent(item.accent),
        image: await photo(files[index % files.length], "news", item.title, `News · ${item.title}`),
        eventDate: null,
        link: "",
      },
    });
  }
  await seedList({ Model: NewsItem, type: "newsItem", label: "News & events", rows });
}

const CATEGORY_ACCENTS = { Parenting: "coral", Curriculum: "turquoise", Franchise: "orange" };

async function seedCategories() {
  if (await BlogCategory.estimatedDocumentCount()) {
    report.skipped.push("Blog categories: already has content");
    return;
  }
  const names = DATA.blogs.categories.filter((name) => name !== "All");
  await BlogCategory.insertMany(
    names.map((name, index) => ({ slug: name.toLowerCase(), name, accent: CATEGORY_ACCENTS[name] || "coral", sortOrder: (index + 1) * 10 })),
  );
  report.added.push(`Blog categories: ${names.length}`);
}

/** Site article blocks → CMS blocks. Headings become plain text; a "heading" over 120 characters was a paragraph. */
function toBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === "h2") {
      const text = plain(block.text);
      return text.length > 120 ? { type: "p", text: block.text } : { type: "h2", text };
    }
    return block;
  });
}

async function seedPosts() {
  if (await alreadyHas(BlogPost, "Blog posts")) return;
  const categories = new Map((await BlogCategory.find().lean()).map((row) => [row.name, String(row._id)]));
  const all = [...DATA.blogs.posts, ...DATA.blogs.extraPosts];
  // These three are not on today's blog page, so they start as drafts (decision 2026-11-07).
  const offIndex = new Set(DATA.blogs.extraPosts.map((post) => post.slug));
  const featuredSlug = DATA.blogs.posts[0]?.slug;
  const rows = [];
  for (const [index, post] of all.entries()) {
    const article = DATA.blogs.articles[post.slug];
    if (!article) {
      report.drafts.push({ label: `Blog · ${post.title}`, reason: "Not copied. The site has no article text for it." });
      continue;
    }
    // Same-day posts keep today's order: each later one is a second older.
    const publishedAt = new Date(Date.parse(`${post.date}T12:00:00Z`) - index * 1000).toISOString();
    rows.push({
      name: post.title,
      slug: post.slug,
      keepDraft: offIndex.has(post.slug) ? "Not on today's blog page. Publish it to add it." : "",
      body: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        category: categories.get(post.category) || "",
        author: article.author || AUTHOR,
        publishedAt,
        coverImage: await photo(post.image, "blogCover", post.title, `Blog · ${post.title}`),
        blocks: toBlocks(article.blocks),
        seo: { metaTitle: "", metaDescription: "" },
      },
    });
  }
  await seedList({
    Model: BlogPost,
    type: "blogPost",
    label: "Blog posts",
    rows,
    extra: (row, live) => ({ featured: live && !row.keepDraft && row.slug === featuredSlug }),
  });
}

function sectionsFor(pageKey) {
  const about = DATA.about;
  const home = DATA.home;
  const head = (block) => ({ kicker: block.kicker, headline: [...block.headline] });
  if (pageKey === "about") {
    return { team: head(about.team), awards: { ...head(about.awards), lead: about.awards.lead } };
  }
  if (pageKey === "home") {
    return {
      programs: head(home.programs),
      voices: head(home.voices),
      news: { ...head(home.news), instagramHandle: home.news.instagram, instagramUrl: home.news.instagramUrl },
    };
  }
  if (pageKey === "blogs") {
    return { hero: { ...head(DATA.blogs.hero), lead: DATA.blogs.hero.lead, pageSize: 9 } };
  }
  return {};
}

/**
 * Page SEO is copied exactly as the site has it today, even where it is longer
 * than the CMS limits; SEO health then lists it so an admin can shorten it.
 */
async function seedPages() {
  const existing = new Set((await PageSeo.find().select("pageKey").lean()).map((row) => row.pageKey));
  const now = new Date();
  let added = 0;
  for (const pageKey of PAGE_KEYS) {
    if (existing.has(pageKey)) continue;
    const source = DATA.pages[pageKey] || {};
    const sections = sectionsFor(pageKey);
    const sectionCheck = contentSchemas.publish.pageSeo(pageKey).shape.sections.safeParse(sections);
    if (!sectionCheck.success) throw new Error(`Page ${pageKey} headings: ${firstIssue(sectionCheck.error)}`);
    const seo = {
      metaTitle: source.title || "",
      metaDescription: source.description || "",
      keywords: [],
      canonicalUrl: "",
      robots: source.noindex ? "noindex,nofollow" : "index,follow",
      ogImage: null,
      schemaJsonLd: "",
    };
    // Written directly: the stored text may be longer than the edit limits until an admin shortens it.
    await PageSeo.collection.insertOne({ pageKey, path: PAGE_PATHS[pageKey], seo, sections: sectionCheck.data, createdAt: now, updatedAt: now });
    added += 1;
    const notes = [];
    if (seo.metaTitle.length > 60) notes.push(`title ${seo.metaTitle.length} chars (max 60)`);
    if (seo.metaDescription.length > 160) notes.push(`description ${seo.metaDescription.length} chars (max 160)`);
    if (seo.metaDescription.length < 50) notes.push(`description ${seo.metaDescription.length} chars (min 50)`);
    if (notes.length) report.pages.push({ label: PAGE_PATHS[pageKey], reason: notes.join(", ") });
  }
  if (added) report.added.push(`Page SEO: ${added} pages`);
  else report.skipped.push("Page SEO: all pages already set");
}

async function seedSiteSettings() {
  if (await SiteSettings.exists({ key: "site" })) {
    report.skipped.push("Site settings: already set");
    return;
  }
  const { contact, social } = DATA.home.footer;
  const body = {
    siteName: "Little Elly",
    siteOrigin: "https://littleelly.com",
    defaultShareImage: null,
    organization: {
      legalName: "Little Elly",
      logo: await photo("/little-elly-logo.png", "logo", "Little Elly logo", "Site logo"),
      phone: contact.phone,
      email: contact.email,
      sameAs: social.map((link) => link.href),
    },
    googleSiteVerification: "",
  };
  const parsed = contentSchemas.publish.siteSettings.safeParse(body);
  if (!parsed.success) throw new Error(`Site settings: ${firstIssue(parsed.error)}`);
  await SiteSettings.create({ key: "site", ...parsed.data });
  report.added.push("Site settings: 1");
}

function print() {
  const line = (text = "") => console.log(text);
  line("\nContent seed");
  line("------------");
  for (const text of report.added) line(`  added    ${text}`);
  for (const text of report.skipped) line(`  skipped  ${text}`);
  if (report.drafts.length) {
    line(`\nNeeds attention (${report.drafts.length}):`);
    for (const item of report.drafts) line(`  - ${item.label}\n      ${item.reason}`);
  }
  if (report.pages.length) {
    line(`\nPage SEO longer than the limits, copied as-is (${report.pages.length}):`);
    for (const item of report.pages) line(`  - ${item.label}: ${item.reason}`);
  }
  if (report.photos.length) {
    line(`\nPhotos to replace (${report.photos.length}). Copied and marked "needs replacing":`);
    for (const item of report.photos) line(`  - ${item.label} (${item.file})\n      ${item.problem}`);
  }
  line();
}

async function main() {
  if (!fs.existsSync(SITE_PUBLIC)) throw new Error(`Website public folder not found: ${SITE_PUBLIC}. Set SITE_PUBLIC_DIR.`);
  await connectDB();
  await syncContentIndexes();
  await seedSiteSettings();
  await seedPages();
  await seedTeam();
  await seedAwards();
  await seedPrograms();
  await seedVoices();
  await seedNews();
  await seedCategories();
  await seedPosts();
  // Photos copied for items that were not saved are removed again.
  for (const image of imageCache.values()) if (image) await retireIfUnused(image);
  print();
}

main()
  .catch((error) => {
    console.error(`Seed stopped: ${redact(error.message)}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
