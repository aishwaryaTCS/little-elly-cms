import mongoose from "mongoose";
import { mediaImageSchema } from "./contentShared.js";

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "site", unique: true },
    siteName: { type: String, trim: true, maxlength: 40, default: "Little Elly" },
    siteOrigin: { type: String, trim: true, maxlength: 200, default: "https://littleelly.com" },
    defaultShareImage: { type: mediaImageSchema, default: null },
    organization: {
      legalName: { type: String, trim: true, maxlength: 80, default: "" },
      logo: { type: mediaImageSchema, default: null },
      phone: { type: String, trim: true, maxlength: 20, default: "" },
      email: { type: String, trim: true, maxlength: 120, default: "" },
      sameAs: { type: [{ type: String, maxlength: 300 }], default: [] },
    },
    googleSiteVerification: { type: String, trim: true, maxlength: 100, default: "" },
  },
  { collection: "site_settings", timestamps: true },
);

export const SiteSettings = mongoose.model("SiteSettings", siteSettingsSchema);
