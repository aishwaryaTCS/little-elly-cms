import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AdminUser } from "../models/AdminUser.js";
import { asyncHandler } from "../lib/async.js";
import { hashPassword, passwordError, passwordsMatch } from "../lib/password.js";
import { presentAdmin } from "../lib/present.js";
import { COOKIE, cookieOptions, signAdmin } from "../lib/tokens.js";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, passwordSchema } from "../validation/schemas.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});

router.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await AdminUser.findOne({ email: req.body.email }).select("+passwordHash +tokenVersion");
    const matches = await passwordsMatch(req.body.password, user?.passwordHash);
    if (!user || !matches || user.role !== "admin") {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    res.cookie(COOKIE, signAdmin(user), cookieOptions());
    return res.json({ admin: presentAdmin(user) });
  }),
);

router.post(
  "/logout",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await AdminUser.updateOne({ _id: req.admin._id }, { $inc: { tokenVersion: 1 } });
    res.clearCookie(COOKIE, cookieOptions());
    return res.json({ ok: true });
  }),
);

router.get(
  "/me",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ admin: presentAdmin(req.admin) });
  }),
);

router.patch(
  "/password",
  loginLimiter,
  requireAdmin,
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const problem = passwordError(req.body.newPassword);
    if (problem) return res.status(400).json({ error: problem, fields: { newPassword: problem } });

    const user = await AdminUser.findById(req.admin._id).select("+passwordHash +tokenVersion");
    const matches = await passwordsMatch(req.body.currentPassword, user?.passwordHash);
    if (!user || !matches) {
      return res.status(401).json({ error: "Current password is incorrect.", fields: { currentPassword: "Current password is incorrect." } });
    }
    if (await passwordsMatch(req.body.newPassword, user.passwordHash)) {
      return res.status(400).json({ error: "Choose a different password.", fields: { newPassword: "Choose a different password." } });
    }

    user.passwordHash = await hashPassword(req.body.newPassword);
    user.tokenVersion += 1;
    await user.save();
    res.cookie(COOKIE, signAdmin(user), cookieOptions());
    return res.json({ ok: true });
  }),
);

export default router;
