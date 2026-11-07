/**
 * Mounts every content admin route under /api/admin (CONTENT_CMS_SPEC.md §9.1).
 */
import { Router } from "express";
import { asyncHandler } from "../lib/async.js";
import { MAX_SLOT_BYTES, SLOTS, slotHelp } from "../lib/slots.js";
import { requireAdmin } from "../middleware/auth.js";
import { Award, BlogPost, NewsItem, Program, TeamMember, Testimonial } from "../models/content.js";
import { categoriesRouter, postsRouter } from "./blog.routes.js";
import { contentRouter } from "./contentCrud.js";
import { pageSeoRouter, siteSettingsRouter } from "./seo.routes.js";

const router = Router();
router.use(requireAdmin);

// BR-4: live item limits per section. Below `min`, the website hides the section.
router.use(
  "/team",
  contentRouter({
    Model: TeamMember,
    type: "teamMember",
    noun: "team member",
    listFilter: (req) => (req.query.kind === "person" || req.query.kind === "group" ? { kind: req.query.kind } : {}),
    limits: (doc) =>
      doc.kind === "group"
        ? { filter: { kind: "group" }, min: 0, max: 4, label: "group photos" }
        : { filter: { kind: "person" }, min: 1, max: 12, label: "team members" },
  }),
);

router.use(
  "/awards",
  contentRouter({ Model: Award, type: "award", noun: "award", limits: () => ({ filter: {}, min: 1, max: 20, label: "awards" }) }),
);

router.use(
  "/programs",
  contentRouter({
    Model: Program,
    type: "program",
    noun: "program",
    slugConfirm: true,
    limits: () => ({ filter: {}, min: 1, max: 7, label: "programs" }),
  }),
);

router.use(
  "/testimonials",
  contentRouter({
    Model: Testimonial,
    type: "testimonial",
    noun: "parent voice",
    limits: () => ({ filter: {}, min: 1, max: 12, label: "parent voices" }),
  }),
);

router.use(
  "/news",
  contentRouter({ Model: NewsItem, type: "newsItem", noun: "news item", limits: () => ({ filter: {}, min: 1, max: 6, label: "news items" }) }),
);

router.use("/blog-posts", postsRouter);
router.use("/blog-categories", categoriesRouter);
router.use("/page-seo", pageSeoRouter);
router.use("/site-settings", siteSettingsRouter);

// IMG-4, IMG-7: the size rules per image place, so the CMS can check and crop before upload.
router.get("/image-slots", (req, res) => {
  const slots = Object.fromEntries(
    Object.entries(SLOTS).map(([name, slot]) => [
      name,
      {
        ratio: slot.ratio,
        ratioText: slot.ratioText || null,
        range: slot.range || null,
        min: slot.min || null,
        minLong: slot.minLong || null,
        minWidth: slot.minWidth || null,
        help: slotHelp(name),
      },
    ]),
  );
  res.json({ slots, maxBytes: MAX_SLOT_BYTES });
});

// UI-9: dashboard counts and the 5 most recently updated items across types.
const TYPES = [
  ["team", "Team", TeamMember, "name"],
  ["awards", "Awards", Award, "issuer"],
  ["programs", "Programs", Program, "name"],
  ["testimonials", "Parent voices", Testimonial, "name"],
  ["news", "News & events", NewsItem, "title"],
  ["blog-posts", "Blog posts", BlogPost, "title"],
];

router.get(
  "/content-stats",
  asyncHandler(async (req, res) => {
    const rows = await Promise.all(
      TYPES.map(async ([key, label, Model, titleField]) => {
        const [published, drafts, recent] = await Promise.all([
          Model.countDocuments({ status: "published" }),
          Model.countDocuments({ status: "draft" }),
          Model.find().sort({ updatedAt: -1 }).limit(5).select(`${titleField} status updatedAt`).lean(),
        ]);
        return {
          count: { key, label, published, drafts },
          recent: recent.map((doc) => ({
            type: key,
            typeLabel: label,
            id: String(doc._id),
            title: doc[titleField] || "Untitled",
            status: doc.status,
            updatedAt: doc.updatedAt,
          })),
        };
      }),
    );
    res.json({
      counts: rows.map((row) => row.count),
      recent: rows
        .flatMap((row) => row.recent)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 5),
    });
  }),
);

export default router;
