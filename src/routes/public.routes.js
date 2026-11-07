import { Router } from "express";
import { Centre } from "../models/Centre.js";
import { FinderSettings } from "../models/FinderSettings.js";
import { NetworkDefaults } from "../models/NetworkDefaults.js";
import { asyncHandler } from "../lib/async.js";
import { presentDefaults, presentFinder } from "../lib/present.js";
import { resolveCentre } from "../lib/resolve.js";

const router = Router();
const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function card(centre) {
  return {
    slug: centre.slug,
    name: centre.name,
    area: centre.area,
    city: centre.city,
    state: centre.state,
    address: centre.address,
    phone: centre.phone || "",
    mapUrl: centre.mapUrl || "",
    head: centre.head || "",
    sortOrder: centre.sortOrder ?? 0,
  };
}

router.get(
  "/finder",
  asyncHandler(async (req, res) => {
    const [finder, centres] = await Promise.all([
      FinderSettings.findOne({ key: "finder" }).lean(),
      Centre.find({ status: "published" })
        .sort({ state: 1, city: 1, sortOrder: 1, area: 1 })
        .limit(1000)
        .select("slug name area city state address phone mapUrl head sortOrder")
        .lean(),
    ]);
    if (!finder) return res.status(404).json({ error: "Finder settings are not available." });
    const cities = new Set(centres.map((centre) => centre.city));
    const states = new Set(centres.map((centre) => centre.state));
    res.json({
      finder: presentFinder(finder),
      counts: { centres: centres.length, cities: cities.size, states: states.size },
      centres: centres.map(card),
    });
  }),
);

router.get(
  "/centres/:slug",
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || "").toLowerCase();
    if (!SLUG.test(slug)) return res.status(404).json({ error: "Centre not found." });
    const [centre, defaults] = await Promise.all([
      Centre.findOne({ slug, status: "published" }).lean(),
      NetworkDefaults.findOne({ key: "defaults" }).lean(),
    ]);
    if (!centre || !defaults) return res.status(404).json({ error: "Centre not found." });
    res.json({
      centre: resolveCentre(centre, defaults),
      page: presentDefaults(defaults).page,
      day: presentDefaults(defaults).day,
    });
  }),
);

export default router;
