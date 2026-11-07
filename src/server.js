import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { env, redact } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { ensureUploadDir, contentTypeFor, localFile } from "./lib/storage.js";
import { requireTrustedOrigin } from "./middleware/origin.js";
import { errorHandler } from "./middleware/errors.js";
import authRoutes from "./routes/auth.routes.js";
import finderRoutes from "./routes/finder.routes.js";
import defaultsRoutes from "./routes/defaults.routes.js";
import centresRoutes from "./routes/centres.routes.js";
import uploadsRoutes from "./routes/uploads.routes.js";
import publicRoutes from "./routes/public.routes.js";
import contentRoutes from "./routes/content.routes.js";
import publicContentRoutes from "./routes/publicContent.routes.js";
import { syncContentIndexes } from "./lib/indexes.js";

const app = express();
app.disable("x-powered-by");
if (env.trustProxy) app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
  }),
);
app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.clientOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api", requireTrustedOrigin);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again shortly." },
});
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again shortly." },
});

app.get("/api/health", (req, res) => {
  res.json({ status: "CMS backend is running" });
});

app.get("/api/db-health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({ database: connected ? "connected" : "disconnected" });
});

app.use("/api/auth", apiLimiter, authRoutes);
app.use("/api/admin/finder", apiLimiter, finderRoutes);
app.use("/api/admin/defaults", apiLimiter, defaultsRoutes);
app.use("/api/admin/centres", apiLimiter, centresRoutes);
app.use("/api/admin/uploads", apiLimiter, uploadsRoutes);
app.use("/api/admin", apiLimiter, contentRoutes);
app.use("/api/public", publicLimiter, publicRoutes, publicContentRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.get("/media/:filename", (req, res) => {
  const file = localFile(req.params.filename);
  if (!file) return res.status(404).end();
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Content-Type", contentTypeFor(req.params.filename));
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.sendFile(file);
});

const adminDist = path.resolve("admin/dist");
if (env.isProd && fs.existsSync(adminDist)) {
  app.use(express.static(adminDist, { index: false, dotfiles: "deny" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.sendFile(path.join(adminDist, "index.html"));
  });
}

app.use(errorHandler);

ensureUploadDir();

connectDB()
  .then(syncContentIndexes)
  .then(() => {
    app.listen(env.port, () => {
      console.log(`CMS running at http://localhost:${env.port}`);
      console.log(`Image storage: ${env.storageDriver}`);
    });
  })
  .catch((error) => {
    console.error(redact(error.message));
    process.exit(1);
  });
