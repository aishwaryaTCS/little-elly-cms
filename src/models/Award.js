import mongoose from "mongoose";
import { mediaImageSchema, SORT, STATUS, CONSENT, seoSchema } from "./contentShared.js";

const awardSchema = new mongoose.Schema(
  {
    issuer: { type: String, trim: true, maxlength: 40, default: "" },
    line: { type: String, trim: true, maxlength: 90, default: "" },
    image: { type: mediaImageSchema, default: null },
    year: { type: Number, min: 1990, max: 2100, default: null },
    seo: { type: seoSchema, default: () => ({}) },
    consent: CONSENT,
    status: STATUS,
    sortOrder: SORT,
  },
  { collection: "awards", timestamps: true },
);

awardSchema.index({ status: 1, sortOrder: 1 });

export const Award = mongoose.model("Award", awardSchema);
