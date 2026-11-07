import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import dotenv from "dotenv";
import { redact } from "../src/config/env.js";
import { headFirstName } from "../src/lib/resolve.js";
import { passwordError } from "../src/lib/password.js";
import { sniffImage } from "../src/lib/storage.js";

dotenv.config();

const base = process.env.CMS_BASE || "http://localhost:3001";
const jar = new Map();
const created = [];
let finderBody;
let defaultsBody;
let tempPassword = "";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function storeCookies(response) {
  for (const cookie of response.headers.getSetCookie?.() || []) {
    const pair = cookie.split(";")[0];
    const splitAt = pair.indexOf("=");
    const name = pair.slice(0, splitAt);
    const value = pair.slice(splitAt + 1);
    if (!value || /max-age=0/i.test(cookie)) jar.delete(name);
    else jar.set(name, value);
  }
}

async function call(path, { method = "GET", body, origin = "http://localhost:5173", raw, cookies = true, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (origin) requestHeaders.origin = origin;
  if (cookies && jar.size) requestHeaders.cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  let payload;
  if (raw !== undefined) {
    payload = raw;
    requestHeaders["content-type"] ||= "application/json";
  } else if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(base + path, { method, headers: requestHeaders, body: payload });
  storeCookies(response);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 180) };
  }
  return { status: response.status, data, headers: response.headers };
}

function centre(overrides = {}) {
  return {
    slug: "zz-boundary",
    name: "Boundary Centre",
    area: "Boundary",
    city: "Boundary City",
    state: "Boundary State",
    address: "1 Boundary Lane",
    phone: "",
    email: "",
    mapUrl: "",
    status: "draft",
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
    ...overrides,
  };
}

function writable(document) {
  const copy = structuredClone(document);
  delete copy.updatedAt;
  delete copy.id;
  return copy;
}

describe("local rules", () => {
  test("password length and character boundaries", () => {
    assert.equal(passwordError("short1"), "Use 10 to 72 characters.");
    assert.equal(passwordError("a".repeat(73)), "Use 10 to 72 characters.");
    assert.equal(passwordError("abcdefghij"), "Include at least one letter and one number.");
    assert.equal(passwordError("1234567890"), "Include at least one letter and one number.");
    assert.equal(passwordError("a".repeat(9) + "1"), "");
    assert.equal(passwordError("a".repeat(71) + "1"), "");
  });

  test("head first name strips the title and keeps the first word", () => {
    assert.equal(headFirstName("Ms. Manasa Gowda"), "Manasa");
    assert.equal(headFirstName("Dr Anita Rao"), "Anita");
    assert.equal(headFirstName("Mr Bob"), "Bob");
    assert.equal(headFirstName("   "), "");
  });

  test("image sniff accepts jpeg png and webp and rejects other bytes", () => {
    assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0x00])).ext, "jpg");
    assert.equal(sniffImage(png).ext, "png");
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
    assert.equal(sniffImage(webp).ext, "webp");
    assert.equal(sniffImage(Buffer.from("GIF89a")), null);
    assert.equal(sniffImage(Buffer.from("<svg></svg>")), null);
    assert.equal(sniffImage(Buffer.alloc(0)), null);
  });

  test("logs do not keep secrets", () => {
    const secret = process.env.ADMIN_PASSWORD;
    const output = redact(`uri=${process.env.MONGODB_URI} jwt=${process.env.JWT_SECRET} pw=${secret}`);
    assert.equal(output.includes(secret), false);
    assert.equal(output.includes(process.env.JWT_SECRET), false);
    assert.equal(output.includes("[redacted]"), true);
  });
});

describe("cms boundaries", { concurrency: false }, () => {
  before(async () => {
    const health = await call("/api/health", { origin: "" });
    assert.equal(health.status, 200, "Start the CMS API before the boundary tests.");
    const login = await call("/api/auth/login", {
      method: "POST",
      body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie") || "", /HttpOnly/i);
    finderBody = writable((await call("/api/admin/finder")).data.finder);
    defaultsBody = writable((await call("/api/admin/defaults")).data.defaults);
  });

  after(async () => {
    for (const id of created) {
      await call(`/api/admin/centres/${id}`, { method: "DELETE" });
    }
    if (finderBody) await call("/api/admin/finder", { method: "PUT", body: finderBody });
    if (defaultsBody) await call("/api/admin/defaults", { method: "PUT", body: defaultsBody });
    if (tempPassword) {
      await call("/api/auth/password", {
        method: "PATCH",
        body: { currentPassword: tempPassword, newPassword: process.env.ADMIN_PASSWORD },
      });
    }
  });

  test("health stays quiet about the database password", async () => {
    const db = await call("/api/db-health");
    assert.equal(db.data.database, "connected");
    assert.equal(JSON.stringify(db.data).includes("mongodb"), false);
    assert.equal(db.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(db.headers.get("cache-control"), /no-store/);
  });

  test("unknown routes and broken ids stay not found", async () => {
    assert.equal((await call("/api/does-not-exist")).status, 404);
    assert.equal((await call("/api/admin/centres/not-an-id")).status, 404);
    assert.equal((await call("/api/public/centres/not-a-real-centre")).data.error, "Centre not found.");
  });

  test("admin routes refuse a missing session and a foreign origin", async () => {
    const locked = await call("/api/admin/centres/stats", { cookies: false });
    assert.equal(locked.status, 401);
    assert.equal((await call("/api/auth/me")).status, 200);
    const foreign = await call("/api/admin/centres", {
      method: "POST",
      origin: "https://evil.example",
      body: centre(),
    });
    assert.equal(foreign.status, 403);
  });

  test("login errors stay generic at the edges", async () => {
    const unknown = await call("/api/auth/login", {
      method: "POST",
      body: { email: "nobody@littleelly.com", password: "wrong-password-1" },
    });
    const wrong = await call("/api/auth/login", {
      method: "POST",
      body: { email: process.env.ADMIN_EMAIL, password: "wrong-password-1" },
    });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.data.error, wrong.data.error);
    assert.equal(Number(wrong.headers.get("ratelimit-limit") || wrong.headers.get("x-ratelimit-limit")), 8);
  });

  test("password change rejects the boundary values and then rotates back", async () => {
    const same = await call("/api/auth/password", {
      method: "PATCH",
      body: { currentPassword: process.env.ADMIN_PASSWORD, newPassword: process.env.ADMIN_PASSWORD },
    });
    assert.equal(same.status, 400);
    const wrong = await call("/api/auth/password", {
      method: "PATCH",
      body: { currentPassword: "not-the-current-1", newPassword: "Replacement9pw" },
    });
    assert.equal(wrong.status, 401);

    const previous = jar.get("le_cms");
    tempPassword = "Replacement9pw";
    const changed = await call("/api/auth/password", {
      method: "PATCH",
      body: { currentPassword: process.env.ADMIN_PASSWORD, newPassword: tempPassword },
    });
    assert.equal(changed.status, 200);
    const fresh = jar.get("le_cms");
    jar.set("le_cms", previous);
    assert.equal((await call("/api/auth/me")).status, 401);
    jar.set("le_cms", fresh);
    const back = await call("/api/auth/password", {
      method: "PATCH",
      body: { currentPassword: tempPassword, newPassword: process.env.ADMIN_PASSWORD },
    });
    assert.equal(back.status, 200);
    tempPassword = "";
  });

  test("centre field boundaries", async () => {
    const accepted = [
      centre({ slug: "a".repeat(80), name: "n".repeat(140), address: "a".repeat(800), sortOrder: 99999, email: "a@b.co", mapUrl: "https://maps.example/a" }),
      centre({ slug: "beml_style_edge", sortOrder: 0, phone: "", email: "", mapUrl: "" }),
      centre({ slug: "ZZ-Mixed-Case" }),
    ];
    for (const body of accepted) {
      const saved = await call("/api/admin/centres", { method: "POST", body });
      assert.equal(saved.status, 201, JSON.stringify(saved.data.fields || saved.data.error));
      created.push(saved.data.centre.id);
      assert.equal(saved.data.centre.slug, body.slug.toLowerCase());
    }

    const rejected = [
      [centre({ slug: "a".repeat(81) }), "slug"],
      [centre({ slug: "centers" }), "slug"],
      [centre({ slug: "centres" }), "slug"],
      [centre({ slug: "api" }), "slug"],
      [centre({ slug: "-bad" }), "slug"],
      [centre({ slug: "bad-" }), "slug"],
      [centre({ name: "" }), "name"],
      [centre({ name: "n".repeat(141) }), "name"],
      [centre({ name: "bad\u0000name" }), "name"],
      [centre({ address: "a".repeat(801) }), "address"],
      [centre({ sortOrder: -1 }), "sortOrder"],
      [centre({ sortOrder: 100000 }), "sortOrder"],
      [centre({ sortOrder: 1.5 }), "sortOrder"],
      [centre({ email: "not-an-email" }), "email"],
      [centre({ mapUrl: "http://maps.example/a" }), "mapUrl"],
      [centre({ status: "archived" }), "status"],
      [centre({ headNotes: Array.from({ length: 9 }, () => "note") }), "headNotes"],
      [centre({ programs: Array.from({ length: 21 }, () => "Toddler") }), "programs"],
      [centre({ facilities: Array.from({ length: 31 }, () => "Room") }), "facilities"],
      [centre({ strengths: Array.from({ length: 13 }, () => ({ label: "A", line: "B" })) }), "strengths"],
      [centre({ useNetworkDefaults: "true" }), "useNetworkDefaults"],
      [centre({ extra: true }), "extra"],
    ];
    for (const [body, field] of rejected) {
      const result = await call("/api/admin/centres", { method: "POST", body: { ...body, slug: body.slug || "zz-reject" } });
      assert.equal(result.status, 400, `${field} was accepted`);
      assert.ok(result.data.fields?.[field] || result.data.fields?.form, JSON.stringify(result.data.fields));
    }
  });

  test("duplicate slugs conflict and whitespace is trimmed", async () => {
    const first = await call("/api/admin/centres", {
      method: "POST",
      body: centre({ slug: "zz-duplicate", name: "  Trimmed Name  ", head: "   " }),
    });
    assert.equal(first.status, 201);
    created.push(first.data.centre.id);
    const full = await call(`/api/admin/centres/${first.data.centre.id}`);
    assert.equal(full.data.centre.name, "Trimmed Name");
    assert.equal(full.data.centre.head, "");
    const again = await call("/api/admin/centres", { method: "POST", body: centre({ slug: "zz-duplicate" }) });
    assert.equal(again.status, 409);
    const other = await call("/api/admin/centres", { method: "POST", body: centre({ slug: "zz-duplicate-b" }) });
    created.push(other.data.centre.id);
    const clash = await call(`/api/admin/centres/${other.data.centre.id}`, {
      method: "PUT",
      body: centre({ slug: "zz-duplicate" }),
    });
    assert.equal(clash.status, 409);
  });

  test("drafts stay hidden and published detail keeps the private fields", async () => {
    const before = await call("/api/public/finder", { origin: "" });
    const saved = await call("/api/admin/centres", {
      method: "POST",
      body: centre({
        slug: "zz-hidden-mail",
        status: "draft",
        email: "hidden@littleelly.com",
        phone: "",
        head: "Ms. Priya Nair",
        headRole: "",
        headSince: "",
        headQuote: "",
        headNotes: [],
      }),
    });
    created.push(saved.data.centre.id);
    const hidden = await call("/api/public/centres/zz-hidden-mail", { origin: "" });
    const missing = await call("/api/public/centres/zz-does-not-exist", { origin: "" });
    assert.equal(hidden.status, 404);
    assert.equal(hidden.data.error, missing.data.error);
    assert.equal(before.data.centres.some((item) => item.slug === "zz-hidden-mail"), false);

    await call(`/api/admin/centres/${saved.data.centre.id}`, {
      method: "PUT",
      body: centre({
        slug: "zz-hidden-mail",
        status: "published",
        email: "hidden@littleelly.com",
        head: "Ms. Priya Nair",
      }),
    });
    const detail = await call("/api/public/centres/ZZ-HIDDEN-MAIL", { origin: "" });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.centre.email, "hidden@littleelly.com");
    assert.equal(detail.data.centre.phone, "");
    assert.equal(detail.data.centre.head.firstName, "Priya");
    assert.equal(detail.data.centre.head.role, "Centre Head");
    assert.equal(detail.data.centre.head.since, "—");
    assert.equal(detail.data.centre.strengths.length, 3);
    assert.equal(detail.data.centre.facilities.length, 6);
    const listed = (await call("/api/public/finder", { origin: "" })).data.centres.find((item) => item.slug === "zz-hidden-mail");
    assert.equal(Object.hasOwn(listed, "email"), false);
  });

  test("own lists replace defaults only when the switch is off and the list is filled", async () => {
    const strengths = [
      { label: "One", line: "First" },
      { label: "Two", line: "Second" },
      { label: "Three", line: "Third" },
      { label: "Four", line: "Fourth" },
    ];
    const facilities = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const saved = await call("/api/admin/centres", {
      method: "POST",
      body: centre({
        slug: "zz-own-lists",
        status: "published",
        useNetworkDefaults: false,
        strengths,
        facilities,
        programs: ["Only Here"],
        hours: [{ label: "Custom", value: "8 to 9" }],
      }),
    });
    created.push(saved.data.centre.id);
    const own = await call("/api/public/centres/zz-own-lists", { origin: "" });
    assert.deepEqual(own.data.centre.strengths.map((item) => item.label), ["One", "Two", "Three"]);
    assert.equal(own.data.centre.facilities.length, 6);
    assert.equal(own.data.centre.facilities.includes("G"), false);
    assert.deepEqual(own.data.centre.programs, ["Only Here"]);
    assert.equal(own.data.centre.hours[0].label, "Custom");

    await call(`/api/admin/centres/${saved.data.centre.id}`, {
      method: "PUT",
      body: centre({ slug: "zz-own-lists", status: "published", useNetworkDefaults: false, programs: ["", "  "] }),
    });
    const fallback = await call("/api/public/centres/zz-own-lists", { origin: "" });
    assert.equal(fallback.data.centre.programs.includes("Toddler"), true);
    assert.equal(fallback.data.centre.head, null);
  });

  test("list search pagination and filters stay inside their bounds", async () => {
    const page = await call("/api/admin/centres?page=0&limit=500");
    assert.equal(page.data.page, 1);
    assert.equal(page.data.centres.length <= 20, true);
    const far = await call("/api/admin/centres?page=99999");
    assert.equal(far.data.centres.length, 0);
    const unsafe = await call("/api/admin/centres?q=" + encodeURIComponent("(+.*$") + "&status=nope&state=" + encodeURIComponent("Karnataka"));
    assert.equal(unsafe.status, 200);
    assert.equal(unsafe.data.cities.includes("Chennai"), false);
    assert.equal(unsafe.data.cities.includes("Bangalore"), true);
    const longQuery = "h".repeat(90);
    assert.equal((await call("/api/admin/centres?q=" + longQuery)).status, 200);
    const hsr = await call("/api/admin/centres?q=hsr-layout-2");
    assert.equal(hsr.data.total, 1);
    const stats = await call("/api/admin/centres/stats");
    const pub = await call("/api/public/finder", { origin: "" });
    assert.equal(stats.data.published, pub.data.counts.centres);
    assert.equal(pub.data.centres.length <= 1000, true);
    assert.equal(pub.data.centres.some((item) => item.slug === "beml_layout"), true);
  });

  test("seeded HSR copy and a centre with no head resolve differently", async () => {
    const hsr = await call("/api/public/centres/hsr-layout-2", { origin: "" });
    assert.equal(hsr.data.centre.head.name, "Ms. Manasa Gowda");
    assert.equal(hsr.data.centre.head.firstName, "Manasa");
    assert.equal(hsr.data.centre.head.since, "2013");
    assert.equal(hsr.data.centre.head.notes.length, 3);
    assert.equal(hsr.data.centre.useNetworkDefaults, true);
    assert.equal(hsr.data.day.length, 6);
    const adoni = await call("/api/public/centres/adoni", { origin: "" });
    assert.equal(adoni.data.centre.head, null);
    assert.match(adoni.data.page.notesHeading, /\{headFirstName\}/);
  });

  test("finder and defaults reject out of range values and restore", async () => {
    const wide = structuredClone(finderBody);
    wide.search.homeResultsCap = 24;
    wide.search.listingPageSize = 1;
    wide.cities = [...wide.cities, { name: "Edge City", lat: 90, lng: -180 }];
    assert.equal((await call("/api/admin/finder", { method: "PUT", body: wide })).status, 200);
    const tooWide = structuredClone(finderBody);
    tooWide.search.homeResultsCap = 25;
    assert.equal((await call("/api/admin/finder", { method: "PUT", body: tooWide })).status, 400);
    tooWide.search.homeResultsCap = 0;
    assert.equal((await call("/api/admin/finder", { method: "PUT", body: tooWide })).status, 400);
    const badPath = structuredClone(finderBody);
    badPath.search.seeAllHref = "//evil.example";
    assert.equal((await call("/api/admin/finder", { method: "PUT", body: badPath })).status, 400);
    const duplicateAlias = structuredClone(finderBody);
    duplicateAlias.aliases = [...duplicateAlias.aliases, { from: "BENGALURU", to: "bangalore" }];
    assert.equal((await call("/api/admin/finder", { method: "PUT", body: duplicateAlias })).status, 400);
    const duplicateCity = structuredClone(finderBody);
    duplicateCity.cities = [...duplicateCity.cities, { name: "pune", lat: 1, lng: 1 }];
    assert.equal((await call("/api/admin/finder", { method: "PUT", body: duplicateCity })).status, 400);
    const badLat = structuredClone(finderBody);
    badLat.cities = [{ name: "Too Far", lat: 90.1, lng: 0 }];
    assert.equal((await call("/api/admin/finder", { method: "PUT", body: badLat })).status, 400);

    const nearby = structuredClone(defaultsBody);
    nearby.page.nearbyCount = 12;
    assert.equal((await call("/api/admin/defaults", { method: "PUT", body: nearby })).status, 200);
    nearby.page.nearbyCount = 13;
    assert.equal((await call("/api/admin/defaults", { method: "PUT", body: nearby })).status, 400);
    const emptyStrengths = structuredClone(defaultsBody);
    emptyStrengths.strengths = [];
    assert.equal((await call("/api/admin/defaults", { method: "PUT", body: emptyStrengths })).status, 400);
    const halfRow = structuredClone(defaultsBody);
    halfRow.strengths = [{ label: "Only", line: "" }];
    assert.equal((await call("/api/admin/defaults", { method: "PUT", body: halfRow })).status, 400);
    const noDay = structuredClone(defaultsBody);
    noDay.day = [];
    assert.equal((await call("/api/admin/defaults", { method: "PUT", body: noDay })).status, 400);
    await call("/api/admin/finder", { method: "PUT", body: finderBody });
    await call("/api/admin/defaults", { method: "PUT", body: defaultsBody });
    const restored = await call("/api/admin/finder");
    assert.equal(restored.data.finder.hero.stat1Value, finderBody.hero.stat1Value);
  });

  test("uploads accept real images and refuse everything else", async () => {
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "dot.png");
    const uploaded = await call("/api/admin/uploads", { method: "POST", body: form });
    assert.equal(uploaded.status, 201);
    assert.match(uploaded.data.image.url, /^\/media\/[0-9a-f-]+\.png$/);
    const media = await call(uploaded.data.image.url, { origin: "" });
    assert.equal(media.status, 200);

    const fake = new FormData();
    fake.append("file", new Blob(["not-an-image"], { type: "image/png" }), "x.png");
    assert.equal((await call("/api/admin/uploads", { method: "POST", body: fake })).status, 400);
    const svg = new FormData();
    svg.append("file", new Blob(["<svg xmlns='http://www.w3.org/2000/svg'></svg>"], { type: "image/svg+xml" }), "x.svg");
    assert.equal((await call("/api/admin/uploads", { method: "POST", body: svg })).status, 400);
    const empty = new FormData();
    assert.equal((await call("/api/admin/uploads", { method: "POST", body: empty })).status, 400);

    const huge = new FormData();
    huge.append("file", new Blob([png, new Uint8Array(5 * 1024 * 1024)]), "big.png");
    const tooBig = await call("/api/admin/uploads", { method: "POST", body: huge });
    assert.equal(tooBig.status, 400);
    assert.match(tooBig.data.error, /5 MB/);

    const jpeg = new FormData();
    jpeg.append("file", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "a.jpg");
    const jpg = await call("/api/admin/uploads", { method: "POST", body: jpeg });
    assert.equal(jpg.status, 201);
    assert.equal((await call(`/api/admin/uploads/${jpg.data.image.filename}`, { method: "DELETE" })).status, 200);
    assert.equal((await call(jpg.data.image.url, { origin: "" })).status, 404);

    const saved = await call("/api/admin/centres", {
      method: "POST",
      body: centre({ slug: "zz-with-photo", heroImage: uploaded.data.image }),
    });
    created.push(saved.data.centre.id);
    assert.equal((await call(`/api/admin/uploads/${uploaded.data.image.filename}`, { method: "DELETE" })).status, 409);
    const forged = centre({
      slug: "zz-forged-photo",
      heroImage: {
        storage: "local",
        key: "evil.png",
        url: "https://evil.example/evil.png",
        filename: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png",
        contentType: "image/png",
      },
    });
    assert.equal((await call("/api/admin/centres", { method: "POST", body: forged })).status, 400);
    assert.equal((await call("/api/admin/uploads/..%2F..%2F.env", { method: "DELETE" })).status, 404);
    assert.equal((await call("/media/..%2F..%2Fpackage.json", { origin: "" })).status, 404);
  });

  test("a request larger than one megabyte is refused", async () => {
    const huge = await call("/api/admin/centres", {
      method: "POST",
      raw: JSON.stringify({ padding: "x".repeat(1024 * 1024 + 20) }),
    });
    assert.equal(huge.status, 413);
  });

  test("logout kills the current session", async () => {
    assert.equal((await call("/api/auth/logout", { method: "POST" })).status, 200);
    assert.equal((await call("/api/auth/me")).status, 401);
    const back = await call("/api/auth/login", {
      method: "POST",
      body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
    });
    assert.equal(back.status, 200);
  });
});
