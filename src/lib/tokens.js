import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const COOKIE = "le_cms";
const EIGHT_HOURS = 8 * 60 * 60 * 1000;

export function signAdmin(user) {
  return jwt.sign({ role: user.role, tv: user.tokenVersion }, env.jwtSecret, {
    subject: String(user._id),
    expiresIn: "8h",
  });
}

export function readAdminToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: EIGHT_HOURS,
  };
}
