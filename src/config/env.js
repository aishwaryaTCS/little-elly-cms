import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in the environment.`);
  return value;
}

const storageDriver = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";

export const env = {
  port: Number(process.env.PORT || 3001),
  mongoUri: required("MONGODB_URI"),
  jwtSecret: required("JWT_SECRET"),
  adminEmail: (process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminName: (process.env.ADMIN_NAME || "Little Elly Admin").trim(),
  isProd: process.env.NODE_ENV === "production",
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production",
  clientOrigins: (process.env.CLIENT_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === "1",
  storageDriver,
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  maxUploadBytes: 5 * 1024 * 1024,
  s3: {
    region: process.env.AWS_REGION || "",
    bucket: process.env.AWS_S3_BUCKET || "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  },
};

if (env.jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters.");
}

if (storageDriver === "s3") {
  const missing = ["region", "bucket", "accessKeyId", "secretAccessKey", "publicBaseUrl"].filter(
    (key) => !env.s3[key],
  );
  if (missing.length) {
    throw new Error(`S3 storage needs ${missing.join(", ")} in the environment.`);
  }
}

export function redact(value) {
  let text = String(value ?? "");
  for (const secret of [env.mongoUri, env.jwtSecret, env.adminPassword, env.s3.secretAccessKey, env.s3.accessKeyId]) {
    if (secret) text = text.split(secret).join("[redacted]");
  }
  return text;
}
