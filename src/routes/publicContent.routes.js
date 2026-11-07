/**
 * Public content API (CONTENT_CMS_SPEC.md §9.2). No sign-in. Published content only.
 * Mounted under /api/public next to the Find a Centre routes.
 */
import { Router } from "express";
import { asyncHandler } from "../lib/async.js";
import { articleView, cards, CATEGORY_FIELDS, LIVE, NEWEST, siteOrigin, trendingPosts } from "../lib/blogQueries.js";
import {
  publicAward,
  publicCategory,
  publicNews,
  publicPage,
  publicPostCard,
  publicProgram,
  publicProgramCard,
  publicSiteSettings,
  publicTeam,
  publicTestimonial,
} from "../lib/publicShape.js";
import { escapeRegex } from "../lib/sanitize.js";
import { Award, BlogCategory, BlogPost, NewsItem, PageSeo, Program, SiteSettings, TeamMember, Testimonial } from "../models/content.js";
import { SLUG } from "../validation/content.js";

const router = Router();
const ORDER = { sortOrder: 1, createdAt: 1 };
const DEFAULT_PAGE_SIZE = 9;

async function sections(pageKey) {
  const page = await PageSeo.findOne({ pageKey }).select("sections").lean();
  return page?.sections && Object.keys(page.sections).length ? page.sections : null;
}

function intParam(value, min, max, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

router.get(
  "/site",
  asyncHandler(async (req, res) => {
    const [site, pages] = await Promise.all([SiteSettings.findOne({ key: "site" }).lean(), PageSeo.find().lean()]);
    const settings = publicSiteSettings(site);
    res.json({ site: settings, pages: pages.map((page) => publicPage(page, settings.siteOrigin)) });
  }),
);

router.get(
  "/about",
  asyncHandler(async (req, res) => {
    const [team, awards, about] = await Promise.all([
      TeamMember.find(LIVE).sort(ORDER).lean(),
      Award.find(LIVE).sort(ORDER).lean(),
      sections("about"),
    ]);
    res.json({
      people: team.filter((row) => row.kind === "person").map(publicTeam.person),
      groups: team.filter((row) => row.kind === "group").map(publicTeam.group),
      awards: awards.map(publicAward),
      sections: about,
    });
  }),
);

router.get(
  "/home",
  asyncHandler(async (req, res) => {
    const [programs, voices, news, home] = await Promise.all([
      Program.find(LIVE).sort(ORDER).lean(),
      Testimonial.find(LIVE).sort(ORDER).lean(),
      NewsItem.find(LIVE).sort(ORDER).limit(6).lean(),
      sections("home"),
    ]);
    res.json({
      programs: programs.map(publicProgramCard),
      testimonials: voices.map(publicTestimonial),
      news: news.map(publicNews),
      sections: home,
    });
  }),
);

router.get(
  "/programs",
  asyncHandler(async (req, res) => {
    const [programs, origin] = await Promise.all([Program.find(LIVE).sort(ORDER).lean(), siteOrigin()]);
    res.json({ programs: programs.map((program) => publicProgram(program, origin)) });
  }),
);

router.get(
  "/programs/:slug",
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    if (!SLUG.test(slug) || slug.length > 120) return res.status(404).json({ error: "Program not found." });
    const [program, origin] = await Promise.all([Program.findOne({ ...LIVE, slug }).lean(), siteOrigin()]);
    if (!program) return res.status(404).json({ error: "Program not found." });
    res.json({ program: publicProgram(program, origin) });
  }),
);

router.get(
  "/blogs",
  asyncHandler(async (req, res) => {
    const blogs = await sections("blogs");
    const pageSize = intParam(req.query.limit, 1, 24, blogs?.hero?.pageSize || DEFAULT_PAGE_SIZE);
    const page = intParam(req.query.page, 1, 1000, 1);
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const categorySlug = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";

    // BR-5: the flagged post, or the newest one.
    const featured =
      (await cards(BlogPost.findOne({ ...LIVE, featured: true }))) || (await cards(BlogPost.findOne(LIVE).sort(NEWEST)));

    const filter = { ...LIVE };
    let noMatch = false;
    if (categorySlug) {
      const category = SLUG.test(categorySlug) ? await BlogCategory.findOne({ slug: categorySlug }).select("_id").lean() : null;
      if (category) filter.category = category._id;
      else noMatch = true;
    }
    if (q) {
      // Search covers every published post, including the featured one (BL-10).
      const pattern = new RegExp(escapeRegex(q), "i");
      const matchedCategories = await BlogCategory.find({ name: pattern }).select("_id").lean();
      filter.$or = [{ title: pattern }, { excerpt: pattern }, { category: { $in: matchedCategories.map((row) => row._id) } }];
    } else if (featured) {
      filter._id = { $ne: featured._id };
    }

    const [total, posts, used, trending] = await Promise.all([
      noMatch ? 0 : BlogPost.countDocuments(filter),
      noMatch ? [] : cards(BlogPost.find(filter).sort(NEWEST).skip((page - 1) * pageSize).limit(pageSize)),
      BlogPost.distinct("category", LIVE),
      trendingPosts(),
    ]);
    const categories = await BlogCategory.find({ _id: { $in: used } }).sort({ sortOrder: 1, name: 1 }).lean();

    res.json({
      featured: featured ? publicPostCard(featured) : null,
      posts: posts.map(publicPostCard),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      categories: categories.map(publicCategory),
      trending,
      sections: blogs,
    });
  }),
);

router.get(
  "/blogs/:slug",
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    if (!SLUG.test(slug) || slug.length > 120) return res.status(404).json({ error: "Story not found." });
    const post = await BlogPost.findOne({ ...LIVE, slug }).populate("category", CATEGORY_FIELDS).lean();
    if (!post) return res.status(404).json({ error: "Story not found." });
    res.json(await articleView(post));
  }),
);

/** SEO-4: every indexable page, program and post, with its last change. */
router.get(
  "/sitemap",
  asyncHandler(async (req, res) => {
    const [pages, programs, posts] = await Promise.all([
      PageSeo.find({ "seo.robots": { $ne: "noindex,nofollow" } }).select("path updatedAt").lean(),
      Program.find({ ...LIVE, "seo.robots": { $ne: "noindex,nofollow" }, slug: { $gt: "" } }).select("slug updatedAt").lean(),
      BlogPost.find({ ...LIVE, "seo.robots": { $ne: "noindex,nofollow" }, slug: { $gt: "" } }).select("slug updatedAt").lean(),
    ]);
    const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : undefined);
    res.json({
      entries: [
        ...pages.map((page) => ({ path: page.path, lastmod: day(page.updatedAt) })),
        ...programs.map((program) => ({ path: `/our-programs/${program.slug}/`, lastmod: day(program.updatedAt) })),
        ...posts.map((post) => ({ path: `/blogs/${post.slug}`, lastmod: day(post.updatedAt) })),
      ],
    });
  }),
);

export default router;
