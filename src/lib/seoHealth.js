/**
 * SEO health flags (CONTENT_CMS_SPEC.md SEO-5): missing description, title over 60,
 * description over 160, missing share image, and titles used more than once.
 */
import { BlogPost, PageSeo, Program } from "../models/content.js";

const key = (title) => String(title || "").trim().toLowerCase();

function check({ title, description, hasImage }, titles) {
  const issues = [];
  if (!title) issues.push("Add a search title.");
  else if (title.length > 60) issues.push("Search title is over 60 characters.");
  if (!description) issues.push("Add a search description.");
  else if (description.length > 160) issues.push("Search description is over 160 characters.");
  if (!hasImage) issues.push("Add a share image.");
  if (title && (titles.get(key(title)) || 0) > 1) issues.push("Search title is used more than once.");
  return issues;
}

/** Effective search title of a post: its SEO title, or its title (BL-5). */
function postTitle(post) {
  return post.seo?.metaTitle || post.title || "";
}

export const seoIssues = {
  /** How many live pages, programs and posts use each search title. */
  async titleCounts() {
    const [pages, programs, posts] = await Promise.all([
      PageSeo.find().select("seo.metaTitle seo.robots").lean(),
      Program.find({ status: "published" }).select("seo.metaTitle").lean(),
      BlogPost.find({ status: "published" }).select("title seo.metaTitle").lean(),
    ]);
    const counts = new Map();
    const add = (title) => {
      if (!title) return;
      counts.set(key(title), (counts.get(key(title)) || 0) + 1);
    };
    pages.forEach((page) => add(page.seo?.metaTitle));
    programs.forEach((program) => add(program.seo?.metaTitle));
    posts.forEach((post) => add(postTitle(post)));
    return counts;
  },

  post(post, titles) {
    return check(
      {
        title: postTitle(post),
        description: post.seo?.metaDescription || post.excerpt || "",
        hasImage: Boolean(post.seo?.ogImage || post.coverImage),
      },
      titles,
    );
  },

  program(program, titles) {
    return check(
      {
        title: program.seo?.metaTitle || "",
        description: program.seo?.metaDescription || "",
        hasImage: Boolean(program.seo?.ogImage || program.photo),
      },
      titles,
    );
  },

  page(page, titles, siteImage) {
    return check(
      {
        title: page?.seo?.metaTitle || "",
        description: page?.seo?.metaDescription || "",
        hasImage: Boolean(page?.seo?.ogImage || siteImage),
      },
      titles,
    );
  },
};
