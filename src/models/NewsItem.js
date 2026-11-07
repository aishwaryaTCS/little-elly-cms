import mongoose from "mongoose";
import { ACCENT_ENUM, mediaImageSchema, SORT, STATUS, CONSENT, seoSchema } from "./contentShared.js";

const newsItemSchema = new mongoose.Schema(
  {
    tag: { type: String, trim: true, maxlength: 20, default: "" },
    title: { type: String, trim: true, maxlength: 60, default: "" },
    line: { type: String, trim: true, maxlength: 140, default: "" },
    accent: { type: String, enum: ACCENT_ENUM, default: "coral" },
    image: { type: mediaImageSchema, default: null },
    eventDate: { type: Date, default: null },
    link: { type: String, trim: true, maxlength: 500, default: "" },
    seo: { type: seoSchema, default: () => ({}) },
    consent: CONSENT,
    status: STATUS,
    sortOrder: SORT,
  },
  { collection: "news_items", timestamps: true },
);

newsItemSchema.index({ status: 1, sortOrder: 1 });

export const NewsItem = mongoose.model("NewsItem", newsItemSchema);
