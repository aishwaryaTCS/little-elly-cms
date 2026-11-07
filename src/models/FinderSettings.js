import mongoose from "mongoose";

const pair = (left, right, leftMax = 80, rightMax = 400) =>
  new mongoose.Schema(
    {
      [left]: { type: String, required: true, trim: true, maxlength: leftMax },
      [right]: { type: String, required: true, trim: true, maxlength: rightMax },
    },
    { _id: false },
  );

const imageSchema = new mongoose.Schema(
  {
    storage: { type: String, enum: ["local", "s3"], required: true },
    key: { type: String, required: true },
    url: { type: String, required: true },
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
  },
  { _id: false },
);

const finderSchema = new mongoose.Schema(
  {
    key: { type: String, default: "finder", unique: true },
    seo: {
      title: { type: String, required: true, maxlength: 160 },
      description: { type: String, required: true, maxlength: 320 },
    },
    hero: {
      kicker: { type: String, required: true, maxlength: 80 },
      headline1: { type: String, required: true, maxlength: 120 },
      headline2: { type: String, required: true, maxlength: 120 },
      lead: { type: String, required: true, maxlength: 500 },
      stat1Value: { type: String, required: true, maxlength: 20 },
      stat1Label: { type: String, required: true, maxlength: 40 },
      stat2Label: { type: String, required: true, maxlength: 40 },
      stat3Label: { type: String, required: true, maxlength: 40 },
      stat4Value: { type: String, required: true, maxlength: 20 },
      stat4Label: { type: String, required: true, maxlength: 40 },
    },
    search: {
      kicker: { type: String, required: true, maxlength: 80 },
      headline: { type: String, required: true, maxlength: 120 },
      headlineAccent: { type: String, required: true, maxlength: 120 },
      lead: { type: String, required: true, maxlength: 400 },
      placeholder: { type: String, required: true, maxlength: 120 },
      nearMe: { type: String, required: true, maxlength: 40 },
      allStates: { type: String, required: true, maxlength: 40 },
      resultsLine: { type: String, required: true, maxlength: 180 },
      emptyState: { type: String, required: true, maxlength: 300 },
      showMore: { type: String, required: true, maxlength: 80 },
      seeAllLabel: { type: String, required: true, maxlength: 80 },
      seeAllHref: { type: String, required: true, maxlength: 200 },
      disclaimer: { type: String, required: true, maxlength: 300 },
      homeResultsCap: { type: Number, required: true, min: 1, max: 24 },
      listingPageSize: { type: Number, required: true, min: 1, max: 60 },
    },
    location: {
      unavailable: { type: String, required: true, maxlength: 180 },
      searching: { type: String, required: true, maxlength: 80 },
      success: { type: String, required: true, maxlength: 180 },
      denied: { type: String, required: true, maxlength: 180 },
    },
    card: {
      view: { type: String, required: true, maxlength: 40 },
      call: { type: String, required: true, maxlength: 40 },
      directions: { type: String, required: true, maxlength: 40 },
      headPrefix: { type: String, required: true, maxlength: 40 },
      popupKicker: { type: String, required: true, maxlength: 80 },
      popupButton: { type: String, required: true, maxlength: 80 },
      closeLabel: { type: String, required: true, maxlength: 40 },
    },
    aliases: { type: [pair("from", "to", 40, 60)], default: [] },
    cities: {
      type: [
        new mongoose.Schema(
          {
            name: { type: String, required: true, trim: true, maxlength: 80 },
            lat: { type: Number, required: true, min: -90, max: 90 },
            lng: { type: Number, required: true, min: -180, max: 180 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { collection: "finder_settings", timestamps: true },
);

export const FinderSettings = mongoose.model("FinderSettings", finderSchema);
export { imageSchema };
