/**
 * Validation for the content CMS (CONTENT_CMS_SPEC.md §4).
 *
 * Every schema comes in two modes:
 *  - draft:   only upper limits apply, so an editor can save half-done work (BR-3).
 *  - publish: every required field must be filled and inside its limits.
 *
 * Use `contentSchemas.draft.x` on save and `contentSchemas.publish.x` before publishing.
 * Pages, categories and site settings are always live, so they use publish mode.
 */
import { z } from "zod";
import { env } from "../config/env.js";
import { SLOTS } from "../lib/slots.js";
import { checkJsonLd, isHttpsUrl, isSafeLink, sanitizeInline, visibleLength } from "../lib/sanitize.js";

export const ACCENTS = ["coral", "orange", "yellow", "turquoise", "periwinkle", "pink", "cyan"];
export const ROBOTS = ["index,follow", "noindex,nofollow"];
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const OBJECT_ID = /^[a-f0-9]{24}$/;
export const PAGE_KEYS = [
  "home",
  "about",
  "programs",
  "curriculum",
  "admissions",
  "franchise",
  "careers",
  "blogs",
  "dubai",
  "franchiseDeck",
  "privacy",
  "terms",
  "admissionsCampaign",
  "franchiseCampaign",
  "thankYou",
];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MAIN_FILE = new RegExp(`^${UUID}\\.webp$`);
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const tooLong = (max) => `Keep this under ${max} characters.`;
const tooShort = (min) => (min <= 1 ? "This field is required." : `Use at least ${min} characters.`);

function baseText(max) {
  return z
    .string({ error: "Enter text." })
    .trim()
    .max(max, tooLong(max))
    .refine((value) => !CONTROL.test(value), "Remove hidden characters.");
}

const whole = (min, max) =>
  z
    .number({ error: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(min, `Use at least ${min}.`)
    .max(max, `Use ${max} or less.`);

const objectId = z.string().regex(OBJECT_ID, "Choose a valid item.");

const slug = (publish) =>
  publish
    ? z
        .string()
        .trim()
        .toLowerCase()
        .min(1, "Add a URL slug.")
        .max(120, tooLong(120))
        .regex(SLUG, "Use lowercase letters, numbers and single hyphens.")
    : z
        .string()
        .trim()
        .toLowerCase()
        .max(120, tooLong(120))
        .refine((value) => value === "" || SLUG.test(value), "Use lowercase letters, numbers and single hyphens.");

const dateField = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.string().datetime({ offset: true })], {
    error: "Enter a valid date.",
  })
  .transform((value, ctx) => {
    const date = new Date(value);
    const year = date.getUTCFullYear();
    if (Number.isNaN(date.getTime()) || year < 2000 || year > 2100) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return date;
  });

function imageUrlOk(image) {
  const id = image.filename.replace(/\.webp$/, "");
  const local = image.storage === "local";
  const base = local ? "/media" : `${env.s3.publicBaseUrl}/media/${image.slot}`;
  if (!local && (!env.s3.publicBaseUrl || image.key !== `media/${image.slot}/${image.filename}`)) return false;
  if (local && image.key !== image.filename) return false;
  if (image.url !== `${base}/${image.filename}`) return false;
  return image.variants.every((variant, index) => {
    if (index === 0) return variant.url === image.url && variant.width === image.width;
    return variant.url === `${base}/${id}-${variant.width}.webp`;
  });
}

export function makeSchemas(publish) {
  /** Text with a min applied only on publish. Optional fields may be empty. */
  function text(min, max, { optional = false } = {}) {
    return baseText(max).refine(
      (value) => !publish || (optional && value === "") || value.length >= min,
      tooShort(min),
    );
  }

  /** Rich inline text (§4.3): sanitised on the way in, limits on the visible text. */
  function rich(min, max) {
    return z
      .string({ error: "Enter text." })
      .max(max * 4, tooLong(max))
      .transform((value) => sanitizeInline(value))
      .superRefine((value, ctx) => {
        const length = visibleLength(value);
        if (length > max) ctx.addIssue({ code: "custom", message: tooLong(max) });
        if (publish && length < min) ctx.addIssue({ code: "custom", message: tooShort(min) });
      });
  }

  function list(item, min, max, label) {
    return z
      .array(item)
      .max(max, `Use ${max} ${label} or fewer.`)
      .refine((items) => !publish || items.length >= min, `Add at least ${min} ${label}.`);
  }

  /** An uploaded image for one slot. Required on publish unless optional. */
  function image(slotName, { optional = false } = {}) {
    const slot = SLOTS[slotName];
    const shape = z
      .object({
        storage: z.enum(["local", "s3"]),
        key: z.string().max(300),
        url: z.string().max(500),
        filename: z.string().regex(MAIN_FILE, "Image reference is not valid."),
        contentType: z.literal("image/webp"),
        slot: z.literal(slotName, { error: "This image was uploaded for a different place." }),
        width: whole(1, 10000),
        height: whole(1, 10000),
        variants: z
          .array(z.object({ width: whole(1, 10000), url: z.string().max(500) }).strict())
          .min(1)
          .max(slot.widths.length),
        alt: text(5, 125),
        // Only the seed sets this (SD-2). Kept so an edit does not drop the flag; never settable to false.
        needsReplacing: z.literal(true).optional(),
      })
      .strict()
      .refine(imageUrlOk, { message: "Image reference is not valid.", path: ["url"] });
    return shape.nullable().refine((value) => !publish || optional || value !== null, "Add an image.");
  }

  const accent = z.enum(ACCENTS, { error: "Choose a colour." });

  // Duplicates are dropped first (case-insensitive), then the limit of 10 applies.
  const keywords = z
    .array(baseText(40).refine((value) => value.length >= 2, "Use at least 2 characters."))
    .max(50, "Use 10 keywords or fewer.")
    .transform((items) => {
      const seen = new Set();
      return items.filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .refine((items) => items.length <= 10, "Use 10 keywords or fewer.");

  const jsonLd = z
    .string()
    .max(12000, "Keep schema markup under 10 KB.")
    .transform((value, ctx) => {
      const result = checkJsonLd(value);
      if (result.error) {
        ctx.addIssue({ code: "custom", message: result.error });
        return z.NEVER;
      }
      return result.value;
    });

  /**
   * SEO block (§4.1). With `fallback`, the title and description may be empty on
   * publish because the site falls back to other fields (BL-5).
   */
  function seo({ fallback = false } = {}) {
    return z
      .object({
        metaTitle: text(10, 60, { optional: fallback }),
        metaDescription: text(50, 160, { optional: fallback }),
        keywords: keywords.default([]),
        canonicalUrl: baseText(500)
          .refine((value) => value === "" || isHttpsUrl(value), "Use a full https:// link.")
          .default(""),
        robots: z.enum(ROBOTS).default("index,follow"),
        ogImage: image("share", { optional: true }).default(null),
        schemaJsonLd: jsonLd.default(""),
      })
      .strict();
  }

  const heading = z
    .array(text(1, 30))
    .length(2, "Use two headline lines.");

  function section(extra = {}) {
    return z.object({ kicker: text(2, 30), headline: heading, ...extra }).strict();
  }

  const sectionsByPage = {
    about: z
      .object({
        team: section(),
        awards: section({ lead: text(10, 160) }),
      })
      .strict(),
    home: z
      .object({
        programs: section(),
        voices: section(),
        news: section({
          instagramHandle: text(2, 40).refine((value) => /^@?[A-Za-z0-9._]+$/.test(value), "Use a valid handle."),
          instagramUrl: baseText(300).refine(isHttpsUrl, "Use a full https:// link."),
        }),
      })
      .strict(),
    blogs: z
      .object({
        hero: section({ lead: text(10, 220), pageSize: whole(3, 24) }),
      })
      .strict(),
  };

  /** People consent: when a photo or name shows a person, both approvals are needed to publish. */
  const consent = z
    .object({ hasPeople: z.boolean(), photoAllowed: z.boolean(), nameAllowed: z.boolean() })
    .strict()
    .refine((c) => !publish || !c.hasPeople || (c.photoAllowed && c.nameAllowed), {
      message: "Tick both approvals to publish.",
      path: ["hasPeople"],
    })
    .default({ hasPeople: false, photoAllowed: false, nameAllowed: false });
  const cardSeo = () => seo({ fallback: true }).default({});

  const person = z
    .object({
      kind: z.literal("person"),
      name: text(2, 40),
      role: text(2, 50),
      note: text(0, 90, { optional: true }).default(""),
      photo: image("teamPerson"),
      consent,
      seo: cardSeo(),
    })
    .strict();

  const group = z
    .object({
      kind: z.literal("group"),
      name: text(2, 40),
      line: text(0, 120, { optional: true }).default(""),
      photo: image("teamGroup"),
      consent,
      seo: cardSeo(),
    })
    .strict();

  const teamMember = z.discriminatedUnion("kind", [person, group], {
    error: "Choose person or group.",
  });

  const thisYear = new Date().getUTCFullYear();
  const award = z
    .object({
      issuer: text(2, 40),
      line: text(10, 90),
      image: image("award"),
      year: whole(1990, thisYear).nullable().default(null),
      consent,
      seo: cardSeo(),
    })
    .strict();

  const program = z
    .object({
      slug: slug(publish),
      name: text(2, 30),
      ageLabel: text(2, 20),
      shortAge: text(2, 8),
      line: text(10, 60),
      longDescription: text(50, 400),
      learn: z
        .array(text(5, 50))
        .max(3, "Use exactly 3 points.")
        .refine((items) => !publish || items.length === 3, "Use exactly 3 points."),
      skills: list(text(3, 40), 4, 8, "skills"),
      ratio: z.object({ adults: whole(1, 5), children: whole(1, 30) }).strict(),
      accent,
      // Programs page set (its own age wording, line and colour).
      pageAgeLabel: text(2, 20),
      pageLine: text(10, 60),
      pageAccent: accent,
      cardPhoto: image("programCard"),
      photo: image("programDetail"),
      seo: seo(),
      consent,
    })
    .strict();

  const testimonial = z
    .object({
      lead: text(5, 50).default("I am glad I chose Little Elly because"),
      highlight: text(10, 140),
      quote: text(50, 600),
      name: text(2, 50),
      role: text(2, 60),
      photo: image("voice"),
      consent,
      seo: cardSeo(),
    })
    .strict();

  const newsItem = z
    .object({
      tag: text(2, 20),
      title: text(5, 60),
      line: text(10, 140),
      accent,
      image: image("news"),
      eventDate: dateField.nullable().default(null),
      link: baseText(500)
        .refine((value) => value === "" || isSafeLink(value), "Use a site path like /admissions/ or a full https:// link.")
        .default(""),
      consent,
      seo: cardSeo(),
    })
    .strict();

  // Blog category and page SEO are always live.
  const blogCategory = z
    .object({
      slug: slug(true),
      name: baseText(30).refine((value) => value.length >= 2, tooShort(2)),
      accent,
    })
    .strict();

  const cell = rich(0, 300);
  const block = z.discriminatedUnion(
    "type",
    [
      z.object({ type: z.literal("p"), text: rich(1, 3000) }).strict(),
      z.object({ type: z.enum(["h2", "h3"]), text: text(2, 120) }).strict(),
      z.object({ type: z.enum(["ul", "ol"]), items: list(rich(1, 1000), 1, 30, "items") }).strict(),
      z.object({ type: z.literal("image"), image: image("blogInline") }).strict(),
      z
        .object({
          type: z.literal("table"),
          head: z.array(cell).min(2, "Use at least 2 columns.").max(6, "Use 6 columns or fewer."),
          rows: z.array(z.array(cell)).max(40, "Use 40 rows or fewer.").refine((rows) => !publish || rows.length >= 1, "Add a row."),
        })
        .strict(),
    ],
    { error: "Unknown block type." },
  ).superRefine((value, ctx) => {
    // discriminatedUnion takes plain objects only, so the table shape check lives here.
    if (value.type === "table" && !value.rows.every((row) => row.length === value.head.length)) {
      ctx.addIssue({ code: "custom", message: "Every row needs one cell per column.", path: ["rows"] });
    }
  });

  const blogPost = z
    .object({
      slug: slug(publish),
      title: text(10, 110),
      excerpt: text(50, 200),
      category: publish ? objectId : objectId.or(z.literal("")).transform((value) => value || null),
      author: text(2, 60),
      publishedAt: publish ? dateField : dateField.nullable().default(null),
      coverImage: image("blogCover"),
      blocks: list(block, 1, 200, "blocks"),
      seo: seo({ fallback: true }),
      consent,
    })
    .strict();

  function pageSeo(pageKey) {
    const sections = sectionsByPage[pageKey];
    return z
      .object({
        seo: seo(),
        sections: sections || z.object({}).strict().default({}),
      })
      .strict();
  }

  const siteSettings = z
    .object({
      siteName: text(2, 40),
      siteOrigin: baseText(200)
        .refine(isHttpsUrl, "Use a full https:// link.")
        .transform((value) => value.replace(/\/+$/, "")),
      defaultShareImage: image("share", { optional: true }).default(null),
      organization: z
        .object({
          legalName: text(2, 80),
          logo: image("logo", { optional: true }).default(null),
          phone: baseText(20).refine((value) => value === "" || /^\+?[0-9 ()-]{6,20}$/.test(value), "Enter a valid phone number."),
          email: baseText(120).refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email address."),
          sameAs: z.array(baseText(300).refine(isHttpsUrl, "Use a full https:// link.")).max(8, "Use 8 profiles or fewer."),
        })
        .strict(),
      googleSiteVerification: baseText(100)
        .refine((value) => value === "" || /^[A-Za-z0-9_-]+$/.test(value), "Use only letters, numbers, - and _.")
        .default(""),
    })
    .strict();

  return { teamMember, award, program, testimonial, newsItem, blogCategory, blogPost, pageSeo, siteSettings, seo, image };
}

export const contentSchemas = {
  draft: makeSchemas(false),
  publish: makeSchemas(true),
};

/** `hideSection` confirms taking the last live item of a section off the site (BR-4). */
export const statusSchema = z
  .object({ status: z.enum(["draft", "published"]), hideSection: z.boolean().optional() })
  .strict();

/** Public route paths per page (§8.1). Read-only for admins. */
export const PAGE_PATHS = {
  home: "/",
  about: "/about-us/",
  programs: "/our-programs/",
  curriculum: "/curriculum/",
  admissions: "/admissions/",
  franchise: "/franchise/",
  careers: "/careers",
  blogs: "/blogs/",
  dubai: "/dubai",
  franchiseDeck: "/franchise-deck",
  privacy: "/privacy-policy/",
  terms: "/terms-conditions/",
  admissionsCampaign: "/admissions-campaign/",
  franchiseCampaign: "/franchise-campaign/",
  thankYou: "/thank-you/",
};

export const reorderSchema = z
  .object({ ids: z.array(objectId).min(1).max(500) })
  .strict()
  .refine((body) => new Set(body.ids).size === body.ids.length, "Each item may appear once.");

export const blogFlagsSchema = z
  .object({
    featured: z.boolean().optional(),
    trending: z.boolean().optional(),
    trendingOrder: whole(1, 6).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Nothing to change.");

export const uploadSlotSchema = z.enum(Object.keys(SLOTS), {
  error: "Choose where this image is used.",
});
