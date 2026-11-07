import { Router } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { asyncHandler } from "../lib/async.js";
import { imageIsUsed } from "../lib/images.js";
import { MAX_SLOT_BYTES } from "../lib/slots.js";
import { deleteUploadByName, MAIN_FILENAME, storeImage, storeSlotImage } from "../lib/storage.js";
import { requireAdmin } from "../middleware/auth.js";
import { uploadSlotSchema } from "../validation/content.js";

const router = Router();
router.use(requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SLOT_BYTES, files: 1, fields: 2, fieldSize: 100 },
});

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: "Choose an image to upload." });
    }

    // Content images name their slot (§6). Centre screens upload without one, as before.
    const slot = req.body?.slot;
    if (slot !== undefined) {
      const parsed = uploadSlotSchema.safeParse(slot);
      if (!parsed.success) return res.status(400).json({ error: "Choose where this image is used." });
      const image = await storeSlotImage(req.file.buffer, parsed.data);
      return res.status(201).json({ image });
    }

    if (req.file.size > env.maxUploadBytes) {
      return res.status(400).json({ error: "Image must be 5 MB or smaller." });
    }
    const image = await storeImage(req.file.buffer);
    res.status(201).json({ image });
  }),
);

router.delete(
  "/:filename",
  asyncHandler(async (req, res) => {
    const filename = req.params.filename;
    if (!MAIN_FILENAME.test(filename)) return res.status(404).json({ error: "Image not found." });
    if (await imageIsUsed(filename)) return res.status(409).json({ error: "This photo is still used." });
    await deleteUploadByName(filename);
    res.json({ ok: true });
  }),
);

export default router;
