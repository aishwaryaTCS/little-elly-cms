import mongoose from "mongoose";
import { mediaImageSchema, SORT, STATUS, CONSENT, seoSchema } from "./contentShared.js";

const teamMemberSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["person", "group"], required: true },
    name: { type: String, trim: true, maxlength: 40, default: "" },
    role: { type: String, trim: true, maxlength: 50, default: "" },
    note: { type: String, trim: true, maxlength: 90, default: "" },
    line: { type: String, trim: true, maxlength: 120, default: "" },
    photo: { type: mediaImageSchema, default: null },
    seo: { type: seoSchema, default: () => ({}) },
    consent: CONSENT,
    status: STATUS,
    sortOrder: SORT,
  },
  { collection: "team_members", timestamps: true },
);

teamMemberSchema.index({ status: 1, sortOrder: 1 });
teamMemberSchema.index({ kind: 1, status: 1, sortOrder: 1 });

export const TeamMember = mongoose.model("TeamMember", teamMemberSchema);
