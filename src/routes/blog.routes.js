/**
 * Blog admin API (CONTENT_CMS_SPEC.md §7.1, §9.1): posts with paged search,
 * featured / trending flags (BR-5, BR-6), and categories (BR-7).
 */
import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../lib/async.js";
import { fieldErrors, httpError, present } from "../lib/content.js";
import { articleView, CATEGORY_FIELDS } from "../lib/blogQueries.js";
import { escapeRegex } from "../lib/sanitize.js";
import { seoIssues } from "../lib/seoHealth.js";
import { BlogCategory, BlogPost } from "../models/content.js";
import { blogFlagsSchema, contentSchemas, reorderSchema } from "../validation/content.js";
import { contentRouter } from "./contentCrud.js";

const MAX_TRENDING = 6;
const CARD_FIELDS = "-blocks";

async function categoryMustExist(body) {
  if (!body.category) return;
  if (!(await BlogCategory.exists({ _id: body.category }))) {
    throw httpError(400, "Check the highlighted fields.", { fields: { category: "Choose a category." } });
  }
}

// ---------------------------------------------------------------- posts

export const postsRouter = Router();

postsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.min(1000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
    const limit = 20;
    const q = String(req.query.q || "").trim().slice(0, 80);
    const filter = {};
    if (req.query.status === "published" || req.query.status === "draft") filter.status = req.query.status;
    if (mongoose.isValidObjectId(req.query.category)) filter.category = req.query.category;
    if (req.query.featured === "true") filter.featured = true;
    if (req.query.trending === "true") filter.trending = true;
    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ title: pattern }, { slug: pattern }];
    }

    const [total, posts, titles] = await Promise.all([
      BlogPost.countDocuments(filter),
      BlogPost.find(filter)
        .select(CARD_FIELDS)
        .sort({ publishedAt: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("category", "name slug accent")
        .lean(),
      seoIssues.titleCounts(),
    ]);

    res.json({
      items: posts.map((post) => ({ ...present(post), seoIssues: seoIssues.post(post, titles) })),
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  }),
);

postsRouter.patch(
  "/:id/flags",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Post not found.");
    const parsed = blogFlagsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(fieldErrors(parsed.error));
    const { featured, trending, trendingOrder } = parsed.data;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const post = await BlogPost.findById(req.params.id).session(session);
        if (!post) throw httpError(404, "Post not found.");
        const turningOn = featured === true || trending === true || (trendingOrder && post.trending);
        if (turningOn && post.status !== "published") throw httpError(409, "Publish the post first.");

        // BR-5: one featured post. Clear the others in the same transaction.
        if (featured === true) {
          await BlogPost.updateMany({ featured: true, _id: { $ne: post._id } }, { $set: { featured: false } }, { session });
          post.featured = true;
        } else if (featured === false) {
          post.featured = false;
        }

        if (trending === false) {
          post.trending = false;
          post.trendingOrder = null;
        } else if (trending === true || (trendingOrder && post.trending)) {
          await placeTrending(post, trendingOrder, session);
        } else if (trendingOrder && !post.trending) {
          throw httpError(409, "Mark the post as trending first.");
        }

        // Written explicitly: placeTrending may have changed these rows in the database already.
        await BlogPost.updateOne(
          { _id: post._id },
          { $set: { featured: post.featured, trending: post.trending, trendingOrder: post.trendingOrder } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    const post = await BlogPost.findById(req.params.id).select(CARD_FIELDS).populate("category", "name slug accent").lean();
    res.json({ item: present(post) });
  }),
);

/**
 * BL-7: the last saved post (draft or live) in the website's article shape, for
 * the CMS preview screen. Admin session only; nothing is shared or published.
 */
postsRouter.get(
  "/:id/preview",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, "Post not found.");
    const post = await BlogPost.findById(req.params.id).populate("category", CATEGORY_FIELDS).lean();
    if (!post) throw httpError(404, "Post not found.");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.json({ ...(await articleView(post)), status: post.status });
  }),
);

/**
 * BR-6: up to 6 trending posts, orders 1–6, no two alike. Asking for an order
 * another post holds swaps them. The unique index on trendingOrder backs this up.
 */
async function placeTrending(post, wanted, session) {
  const others = await BlogPost.find({ trending: true, _id: { $ne: post._id } })
    .select("trendingOrder")
    .session(session)
    .lean();
  if (!post.trending && others.length >= MAX_TRENDING) {
    throw httpError(409, "Remove a trending post first.");
  }
  const taken = new Set(others.map((other) => other.trendingOrder));
  const firstFree = () => [1, 2, 3, 4, 5, 6].find((n) => !taken.has(n));
  const previous = post.trending ? post.trendingOrder : null;
  const order = wanted || previous || firstFree();

  const holder = others.find((other) => other.trendingOrder === order);
  if (holder) {
    // Free our own slot first so the swap never breaks the unique index.
    await BlogPost.updateOne({ _id: post._id }, { $set: { trending: false, trendingOrder: null } }, { session });
    taken.delete(order);
    const moveTo = previous || firstFree();
    await BlogPost.updateOne({ _id: holder._id }, { $set: { trendingOrder: moveTo } }, { session });
  }
  post.trending = true;
  post.trendingOrder = order;
}

postsRouter.use(
  contentRouter({
    Model: BlogPost,
    type: "blogPost",
    noun: "post",
    orderable: false,
    slugConfirm: true,
    limits: () => ({ filter: {}, min: 0, max: Infinity, label: "posts" }),
    verify: categoryMustExist,
    beforePublish(doc) {
      if (!doc.publishedAt) doc.publishedAt = new Date();
    },
    // BR-6: an unpublished post cannot stay featured or trending.
    onUnpublish(doc) {
      doc.featured = false;
      doc.trending = false;
      doc.trendingOrder = null;
    },
  }),
);

// ----------------------------------------------------------- categories

export const categoriesRouter = Router();

function categoryBody(req, res) {
  const parsed = contentSchemas.publish.blogCategory.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(fieldErrors(parsed.error));
    return null;
  }
  return parsed.data;
}

async function loadCategory(id) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, "Category not found.");
  const category = await BlogCategory.findById(id);
  if (!category) throw httpError(404, "Category not found.");
  return category;
}

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [categories, counts] = await Promise.all([
      BlogCategory.find().sort({ sortOrder: 1, name: 1 }).lean(),
      BlogPost.aggregate([{ $group: { _id: "$category", posts: { $sum: 1 } } }]),
    ]);
    const byId = new Map(counts.map((row) => [String(row._id), row.posts]));
    res.json({ items: categories.map((category) => ({ ...present(category), posts: byId.get(String(category._id)) || 0 })) });
  }),
);

categoriesRouter.post(
  "/reorder",
  asyncHandler(async (req, res) => {
    const parsed = reorderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(fieldErrors(parsed.error));
    const { ids } = parsed.data;
    if ((await BlogCategory.countDocuments({ _id: { $in: ids } })) !== ids.length) {
      return res.status(400).json({ error: "Some items no longer exist. Reload and try again." });
    }
    await BlogCategory.bulkWrite(
      ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: (index + 1) * 10 } } } })),
    );
    res.json({ items: (await BlogCategory.find().sort({ sortOrder: 1 }).lean()).map(present) });
  }),
);

categoriesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ item: present((await loadCategory(req.params.id)).toObject()) });
  }),
);

categoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = categoryBody(req, res);
    if (!body) return;
    const last = await BlogCategory.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
    const category = await BlogCategory.create({ ...body, sortOrder: Math.min(9999, (last?.sortOrder ?? 0) + 10) });
    res.status(201).json({ item: present(category.toObject()) });
  }),
);

categoriesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = categoryBody(req, res);
    if (!body) return;
    const category = await loadCategory(req.params.id);
    category.set(body);
    await category.save();
    res.json({ item: present(category.toObject()) });
  }),
);

categoriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const category = await loadCategory(req.params.id);
    if (await BlogPost.exists({ category: category._id })) {
      throw httpError(409, "Move its posts to another category first.");
    }
    await category.deleteOne();
    res.json({ ok: true });
  }),
);
