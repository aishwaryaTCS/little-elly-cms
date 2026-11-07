import mongoose from "mongoose";

/** Shared sub-documents for the content collections (CONTENT_CMS_SPEC.md §4.1). */

const variantSchema = new mongoose.Schema(
  {
    width: { type: Number, required: true, min: 1, max: 10000 },
    url: { type: String, required: true, maxlength: 500 },
  },
  { _id: false },
);

export const mediaImageSchema = new mongoose.Schema(
  {
    storage: { type: String, enum: ["local", "s3"], required: true },
    key: { type: String, required: true, maxlength: 300 },
    url: { type: String, required: true, maxlength: 500 },
    filename: { type: String, required: true, maxlength: 80 },
    contentType: { type: String, enum: ["image/webp"], required: true },
    slot: { type: String, required: true, maxlength: 30 },
    width: { type: Number, required: true, min: 1, max: 10000 },
    height: { type: Number, required: true, min: 1, max: 10000 },
    variants: { type: [variantSchema], default: [] },
    alt: { type: String, trim: true, maxlength: 125, default: "" },
    // Set by the seed when a copied site photo is below its slot's size or shape (SD-2).
    needsReplacing: { type: Boolean, default: undefined },
  },
  { _id: false },
);

export const seoSchema = new mongoose.Schema(
  {
    metaTitle: { type: String, trim: true, maxlength: 60, default: "" },
    metaDescription: { type: String, trim: true, maxlength: 160, default: "" },
    keywords: { type: [{ type: String, maxlength: 40 }], default: [] },
    canonicalUrl: { type: String, trim: true, maxlength: 500, default: "" },
    robots: { type: String, enum: ["index,follow", "noindex,nofollow"], default: "index,follow" },
    ogImage: { type: mediaImageSchema, default: null },
    schemaJsonLd: { type: String, maxlength: 10240, default: "" },
  },
  { _id: false },
);

/** Consent for people shown in a photo or named (required before publishing when hasPeople is true). */
export const consentSchema = new mongoose.Schema(
  {
    hasPeople: { type: Boolean, default: false },
    photoAllowed: { type: Boolean, default: false },
    nameAllowed: { type: Boolean, default: false },
  },
  { _id: false },
);
export const CONSENT = { type: consentSchema, default: () => ({}) };

export const ACCENT_ENUM = ["coral", "orange", "yellow", "turquoise", "periwinkle", "pink", "cyan"];
export const STATUS = { type: String, enum: ["draft", "published"], default: "draft" };
export const SORT = { type: Number, default: 0, min: 0, max: 9999 };
