import path from "node:path";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import { AdminUser } from "../models/AdminUser.js";
import { Centre } from "../models/Centre.js";
import { FinderSettings } from "../models/FinderSettings.js";
import { NetworkDefaults } from "../models/NetworkDefaults.js";
import { hashPassword, passwordError } from "../lib/password.js";
import { centreSchema, defaultsSchema, finderSchema } from "../validation/schemas.js";
import { defaultsSeed, finderSeed, hsrHead } from "./content.js";
import { readCentres } from "./parseCentres.js";
import mongoose from "mongoose";

function parseOrThrow(schema, data, label) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${label}: ${issue?.path?.join(".") || "form"} ${issue?.message}`);
  }
  return parsed.data;
}

function centreRecord(row) {
  const record = {
    slug: String(row.slug || "").trim().toLowerCase(),
    name: row.name || "",
    area: row.area || "",
    city: row.city || "",
    state: row.state || "",
    address: row.address || "",
    phone: row.phone || "",
    email: row.email || "",
    mapUrl: row.mapUrl || "",
    status: "published",
    sortOrder: 0,
    head: "",
    headRole: "",
    headSince: "",
    headQuote: "",
    headNotes: [],
    heroImage: null,
    heroImageAlt: "",
    strengths: [],
    programs: [],
    facilities: [],
    hours: [],
    useNetworkDefaults: true,
  };
  if (record.slug === "hsr-layout-2") Object.assign(record, hsrHead);
  return record;
}

async function seedAdmin() {
  const existing = await AdminUser.countDocuments();
  if (existing) {
    console.log("Admin account already present");
    return;
  }
  if (!env.adminEmail || !env.adminPassword) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD before creating the first admin.");
  }
  const problem = passwordError(env.adminPassword);
  if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
  await AdminUser.create({
    email: env.adminEmail,
    name: env.adminName,
    role: "admin",
    passwordHash: await hashPassword(env.adminPassword),
  });
  console.log(`Created admin ${env.adminEmail}`);
}

async function seed() {
  await connectDB();

  if (!(await FinderSettings.exists({ key: "finder" }))) {
    await FinderSettings.create({ key: "finder", ...parseOrThrow(finderSchema, finderSeed, "Finder") });
    console.log("Finder settings created");
  } else {
    console.log("Finder settings already present");
  }

  if (!(await NetworkDefaults.exists({ key: "defaults" }))) {
    await NetworkDefaults.create({ key: "defaults", ...parseOrThrow(defaultsSchema, defaultsSeed, "Defaults") });
    console.log("Network defaults created");
  } else {
    console.log("Network defaults already present");
  }

  const source = path.resolve(process.env.CENTRES_SOURCE || "../little-elly-grow/src/content/centres.ts");
  const rows = readCentres(source)
    .map(centreRecord)
    .map((row) => parseOrThrow(centreSchema, row, row.slug || "Centre"));

  const existing = new Set((await Centre.find().select("slug").lean()).map((centre) => centre.slug));
  const fresh = rows.filter((row) => !existing.has(row.slug));
  if (fresh.length) await Centre.insertMany(fresh);
  console.log(`Centres inserted: ${fresh.length}. Already stored: ${existing.size}.`);

  await seedAdmin();
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
