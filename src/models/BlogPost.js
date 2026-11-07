import mongoose from "mongoose";
import { mediaImageSchema, seoSchema, STATUS, CONSENT } from "./contentShared.js";

/** One content block (§4.3). Only the fields for its `type` are filled. */
const blockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["p", "h2", "h3", "ul", "ol", "image", "table"], required: true },
    text: { type: String, maxlength: 12000 },
    items: { type: [{ type: String, maxlength: 4000 }], default: undefined },
    image: { type: mediaImageSchema, default: undefined },
    head: { type: [{ type: String, maxlength: 1200 }], default: undefined },
    rows: { type: [[{ type: String, maxlength: 1200 }]], default: undefined },
  },
  { _id: false },
);

const blogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, lowercase: true, trim: true, maxlength: 120, default: "" },
    title: { type: String, trim: true, maxlength: 110, default: "" },
    excerpt: { type: String, trim: true, maxlength: 200, default: "" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "BlogCategory", default: null },
    author: { type: String, trim: true, maxlength: 60, default: "" },
    publishedAt: { type: Date, default: null },
    coverImage: { type: mediaImageSchema, default: null },
    blocks: { type: [blockSchema], default: [] },
    featured: { type: Boolean, default: false },
    trending: { type: Boolean, default: false },
    trendingOrder: { type: Number, min: 1, max: 6, default: null },
    seo: { type: seoSchema, default: () => ({}) },
    consent: CONSENT,
    status: STATUS,
  },
  { collection: "blog_posts", timestamps: true },
);

blogPostSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $gt: "" } } });
blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ status: 1, category: 1, publishedAt: -1 });
// The database itself allows one featured post (BR-5) and one post per trending place 1–6 (BR-6).
blogPostSchema.index({ featured: 1 }, { unique: true, partialFilterExpression: { featured: true } });
blogPostSchema.index({ trending: 1, trendingOrder: 1 }, { unique: true, partialFilterExpression: { trending: true } });

export const BlogPost = mongoose.model("BlogPost", blogPostSchema);
