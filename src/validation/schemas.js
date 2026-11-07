import { z } from "zod";
import { env } from "../config/env.js";

const RESERVED = new Set([
  "about",
  "about-us",
  "admin",
  "admissions",
  "admissions-campaign",
  "api",
  "blogs",
  "careers",
  "centers",
  "centres",
  "curriculum",
  "dubai",
  "franchise",
  "franchise-campaign",
  "franchise-deck",
  "media",
  "our-programs",
  "privacy-policy",
  "programs",
  "terms-conditions",
  "thank-you",
]);

function text(max, min = 0) {
  let schema = z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .refine((value) => !value.includes("\u0000"), "Invalid characters.");
  if (min > 0) schema = schema.refine((value) => value.length >= min, "This field is required.");
  return schema;
}

const sitePath = z
  .string()
  .trim()
  .max(200)
  .refine((value) => /^\/(?!\/)/.test(value), "Use a site path that starts with /.");

const emailField = z
  .string()
  .trim()
  .max(120)
  .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email address.");

const mapField = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https:\/\/\S+$/i.test(value), "Directions link must start with https://.");

const whole = (min, max) =>
  z
    .number({ error: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(min, `Use at least ${min}.`)
    .max(max, `Use ${max} or less.`);

function uniqueItems(items, keyOf, message, ctx) {
  const seen = new Set();
  items.forEach((item, index) => {
    const key = keyOf(item).toLowerCase();
    if (!key) return;
    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", message, path: [index, "from"] });
    }
    seen.add(key);
  });
}

const contentTypeForExt = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const imageSchema = z
  .object({
    storage: z.enum(["local", "s3"]),
    key: z.string().trim().min(1).max(300),
    url: z.string().trim().max(500),
    filename: z
      .string()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/, "Image reference is not valid."),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  })
  .strict()
  .superRefine((image, ctx) => {
    const ext = image.filename.split(".").pop();
    if (contentTypeForExt[ext] !== image.contentType) {
      ctx.addIssue({ code: "custom", message: "Image reference is not valid.", path: ["contentType"] });
    }
    const localOk = image.storage === "local" && image.key === image.filename && image.url === `/media/${image.filename}`;
    const remoteOk =
      image.storage === "s3" &&
      Boolean(env.s3.publicBaseUrl) &&
      image.key === `centres/${image.filename}` &&
      image.url === `${env.s3.publicBaseUrl}/centres/${image.filename}`;
    if (!localOk && !remoteOk) {
      ctx.addIssue({ code: "custom", message: "Image reference is not valid.", path: ["url"] });
    }
  })
  .nullable();

const labelLine = z
  .object({
    label: text(80),
    line: text(400),
  })
  .strict();

const labelValue = z
  .object({
    label: text(80),
    value: text(120),
  })
  .strict();

function filledPairs(schema, labelName, lineName) {
  return z
    .array(schema)
    .max(12)
    .transform((rows) => rows.filter((row) => row[labelName] || row[lineName]))
    .refine((rows) => rows.every((row) => row[labelName] && row[lineName]), "Fill in both parts of each row.");
}

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter the email address you use here."),
    password: z.string().min(1, "Enter your password.").max(72, "That password is too long."),
  })
  .strict();

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(72),
    newPassword: z.string().min(1).max(72),
  })
  .strict();

export const finderSchema = z
  .object({
    seo: z.object({ title: text(160, 1), description: text(320, 1) }).strict(),
    hero: z
      .object({
        kicker: text(80, 1),
        headline1: text(120, 1),
        headline2: text(120, 1),
        lead: text(500, 1),
        stat1Value: text(20, 1),
        stat1Label: text(40, 1),
        stat2Label: text(40, 1),
        stat3Label: text(40, 1),
        stat4Value: text(20, 1),
        stat4Label: text(40, 1),
      })
      .strict(),
    search: z
      .object({
        kicker: text(80, 1),
        headline: text(120, 1),
        headlineAccent: text(120, 1),
        lead: text(400, 1),
        placeholder: text(120, 1),
        nearMe: text(40, 1),
        allStates: text(40, 1),
        resultsLine: text(180, 1),
        emptyState: text(300, 1),
        showMore: text(80, 1),
        seeAllLabel: text(80, 1),
        seeAllHref: sitePath,
        disclaimer: text(300, 1),
        homeResultsCap: whole(1, 24),
        listingPageSize: whole(1, 60),
      })
      .strict(),
    location: z
      .object({
        unavailable: text(180, 1),
        searching: text(80, 1),
        success: text(180, 1),
        denied: text(180, 1),
      })
      .strict(),
    card: z
      .object({
        view: text(40, 1),
        call: text(40, 1),
        directions: text(40, 1),
        headPrefix: text(40, 1),
        popupKicker: text(80, 1),
        popupButton: text(80, 1),
        closeLabel: text(40, 1),
      })
      .strict(),
    aliases: z
      .array(
        z
          .object({
            from: z
              .string()
              .trim()
              .toLowerCase()
              .regex(/^[a-z0-9]+$/, "Use letters and numbers only.")
              .max(40),
            to: text(60, 1),
          })
          .strict(),
      )
      .max(80)
      .superRefine((aliases, ctx) => uniqueItems(aliases, (alias) => alias.from, "This word is already listed.", ctx)),
    cities: z
      .array(
        z
          .object({
            name: text(80, 1),
            lat: z.number({ error: "Enter a latitude." }).finite().gte(-90).lte(90),
            lng: z.number({ error: "Enter a longitude." }).finite().gte(-180).lte(180),
          })
          .strict(),
      )
      .max(100)
      .superRefine((cities, ctx) => {
        const seen = new Set();
        cities.forEach((city, index) => {
          const key = city.name.toLowerCase();
          if (seen.has(key)) {
            ctx.addIssue({
              code: "custom",
              message: "This city is already listed.",
              path: [index, "name"],
            });
          }
          seen.add(key);
        });
      }),
  })
  .strict();

const pageSchema = z
  .object({
    seoTitle: text(180, 1),
    seoDescription: text(320, 1),
    breadcrumbRoot: text(40, 1),
    intro: text(500, 1),
    bookVisit: text(40, 1),
    bookVisitHref: sitePath,
    headKicker: text(80, 1),
    sinceLine: text(120, 1),
    callCentre: text(40, 1),
    notesHeading: text(120, 1),
    mascotLine: text(200, 1),
    strengthsKicker: text(80, 1),
    dayHeading: text(120, 1),
    programsKicker: text(80, 1),
    facilitiesKicker: text(80, 1),
    timingsKicker: text(40, 1),
    addressKicker: text(40, 1),
    directionsButton: text(40, 1),
    enquireHeading: text(180, 1),
    enquireWithHead: text(300, 1),
    enquireNoHead: text(300, 1),
    emailButton: text(40, 1),
    admissionsButton: text(40, 1),
    admissionsHref: sitePath,
    emailPopupKicker: text(80, 1),
    emailPopupButton: text(80, 1),
    nearbyKicker: text(80, 1),
    nearbyCardLink: text(40, 1),
    seeAllLabel: text(80, 1),
    seeAllHref: sitePath,
    nearbyCount: whole(1, 12),
  })
  .strict();

export const defaultsSchema = z
  .object({
    page: pageSchema,
    strengths: filledPairs(labelLine, "label", "line").refine((rows) => rows.length > 0, "Add at least one strength."),
    facilities: z
      .array(text(80))
      .max(30)
      .transform((items) => items.filter(Boolean))
      .refine((items) => items.length > 0, "Add at least one facility."),
    programs: z
      .array(text(80))
      .max(20)
      .transform((items) => items.filter(Boolean))
      .refine((items) => items.length > 0, "Add at least one program."),
    hours: filledPairs(labelValue, "label", "value").refine((rows) => rows.length > 0, "Add at least one timing."),
    day: z
      .array(
        z
          .object({
            time: text(20, 1),
            title: text(40, 1),
            photo: imageSchema,
          })
          .strict(),
      )
      .min(1, "Keep at least one step in the day.")
      .max(8),
  })
  .strict();

export const centreSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "Use lowercase letters, numbers, hyphens, or underscores.")
      .max(80)
      .refine((slug) => !RESERVED.has(slug), "This address is reserved by the website."),
    name: text(140, 1),
    area: text(140, 1),
    city: text(80, 1),
    state: text(80, 1),
    address: text(800, 1),
    phone: text(40),
    email: emailField,
    mapUrl: mapField,
    status: z.enum(["published", "draft"]),
    sortOrder: whole(0, 99999),
    head: text(120),
    headRole: text(80),
    headSince: text(40),
    headQuote: text(500),
    headNotes: z
      .array(text(1000))
      .max(8)
      .transform((notes) => notes.map((note) => note.trim()).filter(Boolean)),
    heroImage: imageSchema,
    heroImageAlt: text(180),
    strengths: filledPairs(labelLine, "label", "line"),
    programs: z
      .array(text(80))
      .max(20)
      .transform((items) => items.filter(Boolean)),
    facilities: z
      .array(text(80))
      .max(30)
      .transform((items) => items.filter(Boolean)),
    hours: filledPairs(labelValue, "label", "value"),
    useNetworkDefaults: z.boolean(),
  })
  .strict();
