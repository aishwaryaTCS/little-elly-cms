/**
 * Page SEO and site settings (CONTENT_CMS_SPEC.md §8, §9.1).
 * Both are always live: saves are checked with the publish rules.
 */
import { Router } from "express";
import { asyncHandler } from "../lib/async.js";
import { fieldErrors, imagesOf, present } from "../lib/content.js";
import { retireReplaced } from "../lib/images.js";
import { seoIssues } from "../lib/seoHealth.js";
import { assertUniqueSeo } from "../lib/seoUnique.js";
import { PageSeo, SiteSettings } from "../models/content.js";
import { contentSchemas, PAGE_KEYS, PAGE_PATHS } from "../validation/content.js";

const blankSeo = {
  metaTitle: "",
  metaDescription: "",
  keywords: [],
  canonicalUrl: "",
  robots: "index,follow",
  ogImage: null,
  schemaJsonLd: "",
};

function pageView(pageKey, doc) {
  if (doc) return { ...present(doc), saved: true };
  return { id: null, pageKey, path: PAGE_PATHS[pageKey], seo: blankSeo, sections: {}, saved: false };
}

export const pageSeoRouter = Router();

pageSeoRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [docs, titles, site] = await Promise.all([
      PageSeo.find().lean(),
      seoIssues.titleCounts(),
      SiteSettings.findOne({ key: "site" }).select("defaultShareImage").lean(),
    ]);
    const byKey = new Map(docs.map((doc) => [doc.pageKey, doc]));
    res.json({
      items: PAGE_KEYS.map((pageKey) => {
        const doc = byKey.get(pageKey);
        return {
          ...pageView(pageKey, doc),
          seoIssues: seoIssues.page(doc, titles, site?.defaultShareImage),
        };
      }),
    });
  }),
);

pageSeoRouter.get(
  "/:pageKey",
  asyncHandler(async (req, res) => {
    const { pageKey } = req.params;
    if (!PAGE_KEYS.includes(pageKey)) return res.status(404).json({ error: "Page not found." });
    res.json({ item: pageView(pageKey, await PageSeo.findOne({ pageKey }).lean()) });
  }),
);

pageSeoRouter.put(
  "/:pageKey",
  asyncHandler(async (req, res) => {
    const { pageKey } = req.params;
    if (!PAGE_KEYS.includes(pageKey)) return res.status(404).json({ error: "Page not found." });
    const parsed = contentSchemas.publish.pageSeo(pageKey).safeParse(req.body);
    if (!parsed.success) return res.status(400).json(fieldErrors(parsed.error));

    const before = await PageSeo.findOne({ pageKey }).lean();
    await assertUniqueSeo(parsed.data.seo, before?._id);
    const doc = await PageSeo.findOneAndUpdate(
      { pageKey },
      { $set: { ...parsed.data, path: PAGE_PATHS[pageKey] }, $setOnInsert: { pageKey } },
      { new: true, upsert: true, runValidators: true },
    ).lean();
    if (before) await retireReplaced(imagesOf.pageSeo(before), imagesOf.pageSeo(doc));
    res.json({ item: pageView(pageKey, doc) });
  }),
);

/**
 * Saves one section heading (§4.4) on its own, from the list screen it belongs to.
 * Only that section is checked, so long legacy SEO text on the page cannot block it.
 */
pageSeoRouter.patch(
  "/:pageKey/sections/:section",
  asyncHandler(async (req, res) => {
    const { pageKey, section } = req.params;
    const sections = PAGE_KEYS.includes(pageKey) ? contentSchemas.publish.pageSeo(pageKey).shape.sections : null;
    const schema = sections?.shape?.[section];
    if (!schema || !Object.hasOwn(sections.shape, section)) return res.status(404).json({ error: "Section not found." });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(fieldErrors(parsed.error));
    const doc = await PageSeo.findOneAndUpdate(
      { pageKey },
      { $set: { [`sections.${section}`]: parsed.data } },
      { new: true },
    ).lean();
    if (!doc) return res.status(409).json({ error: "Save this page's search details first." });
    res.json({ item: pageView(pageKey, doc) });
  }),
);

export const siteSettingsRouter = Router();

const DEFAULT_SETTINGS = {
  siteName: "Little Elly",
  siteOrigin: "https://littleelly.com",
  defaultShareImage: null,
  organization: { legalName: "", logo: null, phone: "", email: "", sameAs: [] },
  googleSiteVerification: "",
};

siteSettingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const doc = await SiteSettings.findOne({ key: "site" }).lean();
    res.json({ item: doc ? present(doc) : { id: null, ...DEFAULT_SETTINGS } });
  }),
);

siteSettingsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = contentSchemas.publish.siteSettings.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(fieldErrors(parsed.error));
    const before = await SiteSettings.findOne({ key: "site" }).lean();
    const doc = await SiteSettings.findOneAndUpdate(
      { key: "site" },
      { $set: parsed.data, $setOnInsert: { key: "site" } },
      { new: true, upsert: true, runValidators: true },
    ).lean();
    if (before) await retireReplaced(imagesOf.siteSettings(before), imagesOf.siteSettings(doc));
    res.json({ item: present(doc) });
  }),
);
