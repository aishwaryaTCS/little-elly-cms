/**
 * Blog lookups shared by the public API and the admin preview, so the preview
 * shows exactly what the website would.
 */
import { publicPost, publicPostCard } from "./publicShape.js";
import { BlogPost, SiteSettings } from "../models/content.js";

export const LIVE = { status: "published" };
export const NEWEST = { publishedAt: -1, _id: -1 };
export const CATEGORY_FIELDS = "name slug accent sortOrder";
const TRENDING = 6;

export function cards(query) {
  return query.select("-blocks").populate("category", CATEGORY_FIELDS).lean();
}

export async function siteOrigin() {
  const site = await SiteSettings.findOne({ key: "site" }).select("siteOrigin").lean();
  return site?.siteOrigin || "https://littleelly.com";
}

/** BR-6: trending posts in their places, or the newest when none are set. */
export async function trendingPosts(excludeId) {
  const not = excludeId ? { _id: { $ne: excludeId } } : {};
  const picked = await cards(BlogPost.find({ ...LIVE, ...not, trending: true }).sort({ trendingOrder: 1 }).limit(TRENDING));
  if (picked.length) return picked.map(publicPostCard);
  return (await cards(BlogPost.find({ ...LIVE, ...not }).sort(NEWEST).limit(TRENDING))).map(publicPostCard);
}

/** Related: same category first, then the newest others, max 8. */
export async function relatedPosts(post) {
  const not = { _id: { $ne: post._id } };
  const categoryId = post.category?._id || post.category || null;
  const same = categoryId
    ? await cards(BlogPost.find({ ...LIVE, ...not, category: categoryId }).sort(NEWEST).limit(8))
    : [];
  const rest =
    same.length < 8
      ? await cards(
          BlogPost.find({ ...LIVE, _id: { $nin: [post._id, ...same.map((row) => row._id)] } })
            .sort(NEWEST)
            .limit(8 - same.length),
        )
      : [];
  return [...same, ...rest].map(publicPostCard);
}

/** One post as the article page shows it: the post, related posts and trending. */
export async function articleView(post) {
  const [origin, related, trending] = await Promise.all([siteOrigin(), relatedPosts(post), trendingPosts(post._id)]);
  return { post: publicPost(post, origin), related, trending };
}
