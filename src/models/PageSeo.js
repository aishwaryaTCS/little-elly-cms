import mongoose from "mongoose";
import { seoSchema } from "./contentShared.js";

const pageSeoSchema = new mongoose.Schema(
  {
    pageKey: { type: String, required: true, unique: true, maxlength: 40 },
    path: { type: String, required: true, maxlength: 120 },
    seo: { type: seoSchema, default: () => ({}) },
    // Section headings for this page (§4.4). zod checks the shape per pageKey before saving.
    sections: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { collection: "page_seo", timestamps: true, minimize: false },
);

export const PageSeo = mongoose.model("PageSeo", pageSeoSchema);
