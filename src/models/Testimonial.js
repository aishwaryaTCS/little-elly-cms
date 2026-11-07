import mongoose from "mongoose";
import { mediaImageSchema, SORT, STATUS, CONSENT, seoSchema } from "./contentShared.js";

const testimonialSchema = new mongoose.Schema(
  {
    lead: { type: String, trim: true, maxlength: 50, default: "I am glad I chose Little Elly because" },
    highlight: { type: String, trim: true, maxlength: 140, default: "" },
    quote: { type: String, trim: true, maxlength: 600, default: "" },
    name: { type: String, trim: true, maxlength: 50, default: "" },
    role: { type: String, trim: true, maxlength: 60, default: "" },
    photo: { type: mediaImageSchema, default: null },
    seo: { type: seoSchema, default: () => ({}) },
    consent: CONSENT,
    status: STATUS,
    sortOrder: SORT,
  },
  { collection: "testimonials", timestamps: true },
);

testimonialSchema.index({ status: 1, sortOrder: 1 });

export const Testimonial = mongoose.model("Testimonial", testimonialSchema);
