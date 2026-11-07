import mongoose from "mongoose";
import { ACCENT_ENUM, SORT } from "./contentShared.js";

const blogCategorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 30 },
    accent: { type: String, enum: ACCENT_ENUM, default: "coral" },
    sortOrder: SORT,
  },
  { collection: "blog_categories", timestamps: true },
);

blogCategorySchema.index({ sortOrder: 1 });

export const BlogCategory = mongoose.model("BlogCategory", blogCategorySchema);
