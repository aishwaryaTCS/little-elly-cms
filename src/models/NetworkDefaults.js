import mongoose from "mongoose";
import { imageSchema } from "./FinderSettings.js";

const labelLine = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    line: { type: String, required: true, trim: true, maxlength: 400 },
  },
  { _id: false },
);

const labelValue = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 80 },
    value: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false },
);

const dayStep = new mongoose.Schema(
  {
    time: { type: String, required: true, trim: true, maxlength: 20 },
    title: { type: String, required: true, trim: true, maxlength: 40 },
    photo: { type: imageSchema, default: null },
  },
  { _id: false },
);

const defaultsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "defaults", unique: true },
    page: {
      seoTitle: { type: String, required: true, maxlength: 180 },
      seoDescription: { type: String, required: true, maxlength: 320 },
      breadcrumbRoot: { type: String, required: true, maxlength: 40 },
      intro: { type: String, required: true, maxlength: 500 },
      bookVisit: { type: String, required: true, maxlength: 40 },
      bookVisitHref: { type: String, required: true, maxlength: 200 },
      headKicker: { type: String, required: true, maxlength: 80 },
      sinceLine: { type: String, required: true, maxlength: 120 },
      callCentre: { type: String, required: true, maxlength: 40 },
      notesHeading: { type: String, required: true, maxlength: 120 },
      mascotLine: { type: String, required: true, maxlength: 200 },
      strengthsKicker: { type: String, required: true, maxlength: 80 },
      dayHeading: { type: String, required: true, maxlength: 120 },
      programsKicker: { type: String, required: true, maxlength: 80 },
      facilitiesKicker: { type: String, required: true, maxlength: 80 },
      timingsKicker: { type: String, required: true, maxlength: 40 },
      addressKicker: { type: String, required: true, maxlength: 40 },
      directionsButton: { type: String, required: true, maxlength: 40 },
      enquireHeading: { type: String, required: true, maxlength: 180 },
      enquireWithHead: { type: String, required: true, maxlength: 300 },
      enquireNoHead: { type: String, required: true, maxlength: 300 },
      emailButton: { type: String, required: true, maxlength: 40 },
      admissionsButton: { type: String, required: true, maxlength: 40 },
      admissionsHref: { type: String, required: true, maxlength: 200 },
      emailPopupKicker: { type: String, required: true, maxlength: 80 },
      emailPopupButton: { type: String, required: true, maxlength: 80 },
      nearbyKicker: { type: String, required: true, maxlength: 80 },
      nearbyCardLink: { type: String, required: true, maxlength: 40 },
      seeAllLabel: { type: String, required: true, maxlength: 80 },
      seeAllHref: { type: String, required: true, maxlength: 200 },
      nearbyCount: { type: Number, required: true, min: 1, max: 12 },
    },
    strengths: { type: [labelLine], default: [] },
    facilities: { type: [String], default: [] },
    programs: { type: [String], default: [] },
    hours: { type: [labelValue], default: [] },
    day: { type: [dayStep], default: [] },
  },
  { collection: "network_defaults", timestamps: true },
);

export const NetworkDefaults = mongoose.model("NetworkDefaults", defaultsSchema);
