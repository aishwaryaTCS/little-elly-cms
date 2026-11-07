import { redact } from "../config/env.js";

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "That request could not be read." });
  }
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "That request is too large." });
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Image must be 8 MB or smaller." });
  }
  if (err?.name === "MulterError") {
    return res.status(400).json({ error: "That image could not be uploaded." });
  }
  if (err?.code === 11000) {
    const fields = err.keyPattern?.slug ? { slug: "This slug is already used." } : undefined;
    return res.status(409).json({ error: "A record with these details already exists.", fields });
  }
  if (err?.name === "ValidationError") {
    return res.status(400).json({ error: "Check the highlighted fields." });
  }
  if (err?.status) {
    return res.status(err.status).json({ error: err.message || "That request was refused.", ...(err.extra || {}) });
  }

  console.error(redact(err?.stack || err?.message || err));
  return res.status(500).json({ error: "Something went wrong. Try again." });
}
