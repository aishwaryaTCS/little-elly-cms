import { env } from "../config/env.js";

export function requireTrustedOrigin(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const origin = req.get("origin");
  if (!origin || env.clientOrigins.includes(origin)) return next();
  try {
    if (new URL(origin).host === req.get("host")) return next();
  } catch {
    return res.status(403).json({ error: "This request was refused." });
  }
  return res.status(403).json({ error: "This request was refused." });
}
