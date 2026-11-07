import { Router } from "express";
import mongoose from "mongoose";
import { Centre } from "../models/Centre.js";
import { asyncHandler } from "../lib/async.js";
import { retireIfUnused } from "../lib/images.js";
import { presentCentre } from "../lib/present.js";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { centreSchema } from "../validation/schemas.js";

const router = Router();
router.use(requireAdmin);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const q = String(req.query.q || "").trim().slice(0, 80);
    const status = req.query.status === "published" || req.query.status === "draft" ? req.query.status : "";
    const state = String(req.query.state || "").trim().slice(0, 80);
    const city = String(req.query.city || "").trim().slice(0, 80);

    const filter = {};
    if (status) filter.status = status;
    if (state) filter.state = state;
    if (city) filter.city = city;
    if (q) {
      const pattern = new RegExp(escapeRegex(q), "i");
      filter.$or = ["name", "area", "city", "state", "address", "slug"].map((field) => ({ [field]: pattern }));
    }

    const [total, centres, states, cities] = await Promise.all([
      Centre.countDocuments(filter),
      Centre.find(filter)
        .sort({ state: 1, city: 1, sortOrder: 1, area: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Centre.distinct("state"),
      Centre.distinct("city", state ? { state } : {}),
    ]);

    res.json({
      centres: centres.map((centre) => presentCentre(centre, { summary: true })),
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
      states: states.filter(Boolean).sort((a, b) => a.localeCompare(b)),
      cities: cities.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    });
  }),
);

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const [published, drafts, cities, states, recent] = await Promise.all([
      Centre.countDocuments({ status: "published" }),
      Centre.countDocuments({ status: "draft" }),
      Centre.distinct("city", { status: "published" }),
      Centre.distinct("state", { status: "published" }),
      Centre.find().sort({ updatedAt: -1 }).limit(6),
    ]);
    res.json({
      published,
      drafts,
      cities: cities.length,
      states: states.length,
      recent: recent.map((centre) => presentCentre(centre, { summary: true })),
    });
  }),
);

router.post(
  "/",
  validate(centreSchema),
  asyncHandler(async (req, res) => {
    const centre = await Centre.create(req.body);
    res.status(201).json({ centre: presentCentre(centre) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Centre not found." });
    const centre = await Centre.findById(req.params.id);
    if (!centre) return res.status(404).json({ error: "Centre not found." });
    res.json({ centre: presentCentre(centre) });
  }),
);

router.put(
  "/:id",
  validate(centreSchema),
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Centre not found." });
    const previous = await Centre.findById(req.params.id).lean();
    if (!previous) return res.status(404).json({ error: "Centre not found." });
    const centre = await Centre.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (previous.heroImage && previous.heroImage.filename !== centre.heroImage?.filename) {
      await retireIfUnused(previous.heroImage);
    }
    res.json({ centre: presentCentre(centre) });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Centre not found." });
    const centre = await Centre.findByIdAndDelete(req.params.id);
    if (!centre) return res.status(404).json({ error: "Centre not found." });
    if (centre.heroImage) await retireIfUnused(centre.heroImage);
    res.json({ ok: true });
  }),
);

export default router;
