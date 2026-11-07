/**
 * Stops two items (or pages) from sharing the same search title or canonical link,
 * so search engines never see duplicates. Each item is told apart by its own id.
 */
import { Award, BlogPost, NewsItem, PageSeo, Program, TeamMember, Testimonial } from "../models/content.js";
import { escapeRegex } from "./sanitize.js";
import { httpError } from "./content.js";

const MODELS = [Program, BlogPost, TeamMember, Award, Testimonial, NewsItem, PageSeo];

export async function assertUniqueSeo(seo, selfId) {
  const checks = [
    ["metaTitle", "Another item already uses this search title."],
    ["canonicalUrl", "Another item already uses this canonical link."],
  ];
  const fields = {};
  for (const [key, message] of checks) {
    const value = String(seo?.[key] || "").trim();
    if (!value) continue;
    const filter = { [`seo.${key}`]: new RegExp(`^${escapeRegex(value)}$`, "i"), ...(selfId ? { _id: { $ne: selfId } } : {}) };
    const found = await Promise.all(MODELS.map((Model) => Model.exists(filter)));
    if (found.some(Boolean)) fields[`seo.${key}`] = message;
  }
  if (Object.keys(fields).length) throw httpError(409, "Search details must be unique.", { fields });
}
