import { Router } from "express";
import { NetworkDefaults } from "../models/NetworkDefaults.js";
import { asyncHandler } from "../lib/async.js";
import { retireIfUnused } from "../lib/images.js";
import { presentDefaults } from "../lib/present.js";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { defaultsSchema } from "../validation/schemas.js";

const router = Router();
router.use(requireAdmin);

function photoNames(defaults) {
  return (defaults?.day || []).map((step) => step.photo?.filename).filter(Boolean);
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const defaults = await NetworkDefaults.findOne({ key: "defaults" });
    if (!defaults) return res.status(404).json({ error: "Network defaults have not been seeded yet." });
    res.json({ defaults: presentDefaults(defaults) });
  }),
);

router.put(
  "/",
  validate(defaultsSchema),
  asyncHandler(async (req, res) => {
    const previous = await NetworkDefaults.findOne({ key: "defaults" }).lean();
    const defaults = await NetworkDefaults.findOneAndUpdate(
      { key: "defaults" },
      { $set: { ...req.body, key: "defaults" } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    const kept = new Set(photoNames(defaults));
    for (const step of previous?.day || []) {
      if (step.photo && !kept.has(step.photo.filename)) await retireIfUnused(step.photo);
    }
    res.json({ defaults: presentDefaults(defaults) });
  }),
);

export default router;
