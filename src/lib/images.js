import { Centre } from "../models/Centre.js";
import { NetworkDefaults } from "../models/NetworkDefaults.js";
import { Award, BlogPost, NewsItem, PageSeo, Program, SiteSettings, TeamMember, Testimonial } from "../models/content.js";
import { deleteStoredImage } from "../lib/storage.js";

/** Every place an image can be referenced (BR-8). Add new image fields here. */
const IMAGE_PATHS = [
  [Centre, ["heroImage.filename"]],
  [NetworkDefaults, ["day.photo.filename"]],
  [TeamMember, ["photo.filename", "seo.ogImage.filename"]],
  [Award, ["image.filename", "seo.ogImage.filename"]],
  [Program, ["cardPhoto.filename", "photo.filename", "seo.ogImage.filename"]],
  [Testimonial, ["photo.filename", "seo.ogImage.filename"]],
  [NewsItem, ["image.filename", "seo.ogImage.filename"]],
  [BlogPost, ["coverImage.filename", "seo.ogImage.filename", "blocks.image.filename"]],
  [PageSeo, ["seo.ogImage.filename"]],
  [SiteSettings, ["defaultShareImage.filename", "organization.logo.filename"]],
];

export async function imageIsUsed(filename) {
  if (!filename) return false;
  const checks = IMAGE_PATHS.map(([Model, paths]) =>
    Model.exists({ $or: paths.map((path) => ({ [path]: filename })) }),
  );
  const found = await Promise.all(checks);
  return found.some(Boolean);
}

export async function retireIfUnused(image) {
  if (!image?.filename) return;
  if (await imageIsUsed(image.filename)) return;
  await deleteStoredImage(image);
}

/** Retires every image in `before` that is no longer in `after` (used on update and delete). */
export async function retireReplaced(before = [], after = []) {
  const kept = new Set(after.filter(Boolean).map((image) => image.filename));
  for (const image of before.filter(Boolean)) {
    if (!kept.has(image.filename)) await retireIfUnused(image);
  }
}
