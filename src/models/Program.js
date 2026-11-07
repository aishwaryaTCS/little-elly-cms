import mongoose from "mongoose";
import { ACCENT_ENUM, mediaImageSchema, seoSchema, SORT, STATUS, CONSENT } from "./contentShared.js";

const programSchema = new mongoose.Schema(
  {
    // A draft may be saved before it has a slug; the partial index keeps filled slugs unique.
    slug: { type: String, lowercase: true, trim: true, maxlength: 120, default: "" },
    name: { type: String, trim: true, maxlength: 30, default: "" },
    ageLabel: { type: String, trim: true, maxlength: 20, default: "" },
    shortAge: { type: String, trim: true, maxlength: 8, default: "" },
    line: { type: String, trim: true, maxlength: 60, default: "" },
    longDescription: { type: String, trim: true, maxlength: 400, default: "" },
    learn: { type: [{ type: String, maxlength: 50 }], default: [] },
    skills: { type: [{ type: String, maxlength: 40 }], default: [] },
    ratio: {
      adults: { type: Number, min: 1, max: 5, default: 1 },
      children: { type: Number, min: 1, max: 30, default: 10 },
    },
    accent: { type: String, enum: ACCENT_ENUM, default: "coral" },
    // The programs page shows each program with its own age wording, line and colour.
    pageAgeLabel: { type: String, trim: true, maxlength: 20, default: "" },
    pageLine: { type: String, trim: true, maxlength: 60, default: "" },
    // No default: when unset, the programs page uses the home colour.
    pageAccent: { type: String, enum: ACCENT_ENUM },
    cardPhoto: { type: mediaImageSchema, default: null },
    photo: { type: mediaImageSchema, default: null },
    seo: { type: seoSchema, default: () => ({}) },
    consent: CONSENT,
    status: STATUS,
    sortOrder: SORT,
  },
  { collection: "programs", timestamps: true },
);

programSchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $gt: "" } } });
programSchema.index({ status: 1, sortOrder: 1 });

export const Program = mongoose.model("Program", programSchema);
