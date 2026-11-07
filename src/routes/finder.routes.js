import { Router } from "express";
import { FinderSettings } from "../models/FinderSettings.js";
import { asyncHandler } from "../lib/async.js";
import { presentFinder } from "../lib/present.js";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { finderSchema } from "../validation/schemas.js";

const router = Router();
router.use(requireAdmin);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const finder = await FinderSettings.findOne({ key: "finder" });
    if (!finder) return res.status(404).json({ error: "Finder settings have not been seeded yet." });
    res.json({ finder: presentFinder(finder) });
  }),
);

router.put(
  "/",
  validate(finderSchema),
  asyncHandler(async (req, res) => {
    const finder = await FinderSettings.findOneAndUpdate(
      { key: "finder" },
      { $set: { ...req.body, key: "finder" } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    res.json({ finder: presentFinder(finder) });
  }),
);

export default router;
