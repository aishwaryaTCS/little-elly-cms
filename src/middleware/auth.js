import { AdminUser } from "../models/AdminUser.js";
import { COOKIE, readAdminToken } from "../lib/tokens.js";

export async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: "Sign in required." });
    const payload = readAdminToken(token);
    if (payload.role !== "admin") return res.status(403).json({ error: "You do not have access to this." });
    const user = await AdminUser.findById(payload.sub).select("+tokenVersion");
    if (!user || user.role !== "admin" || user.tokenVersion !== payload.tv) {
      return res.status(401).json({ error: "Sign in required." });
    }
    req.admin = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Sign in required." });
  }
}
