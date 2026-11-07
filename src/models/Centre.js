import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    storage: { type: String, enum: ["local", "s3"], required: true },
    key: { type: String, required: true, maxlength: 300 },
    url: { type: String, required: true, maxlength: 500 },
    filename: { type: String, required: true, maxlength: 80 },
    contentType: { type: String, required: true, maxlength: 40 },
  },
  { _id: false },
);

const labelLineSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    line: { type: String, required: true, trim: true, maxlength: 400 },
  },
  { _id: false },
);

const labelValueSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    value: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false },
);

const centreSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    area: { type: String, required: true, trim: true, maxlength: 140 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    address: { type: String, required: true, trim: true, maxlength: 800 },
    phone: { type: String, trim: true, maxlength: 40, default: "" },
    email: { type: String, trim: true, maxlength: 120, default: "" },
    mapUrl: { type: String, trim: true, maxlength: 500, default: "" },
    status: { type: String, enum: ["published", "draft"], default: "draft" },
    sortOrder: { type: Number, default: 0, min: 0, max: 99999 },
    head: { type: String, trim: true, maxlength: 120, default: "" },
    headRole: { type: String, trim: true, maxlength: 80, default: "" },
    headSince: { type: String, trim: true, maxlength: 40, default: "" },
    headQuote: { type: String, trim: true, maxlength: 500, default: "" },
    headNotes: { type: [String], default: [] },
    heroImage: { type: imageSchema, default: null },
    heroImageAlt: { type: String, trim: true, maxlength: 180, default: "" },
    strengths: { type: [labelLineSchema], default: [] },
    programs: { type: [String], default: [] },
    facilities: { type: [String], default: [] },
    hours: { type: [labelValueSchema], default: [] },
    useNetworkDefaults: { type: Boolean, default: true },
  },
  { collection: "centres", timestamps: true },
);

centreSchema.index({ status: 1, state: 1, city: 1 });

export const Centre = mongoose.model("Centre", centreSchema);
