import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env, redact } from "../config/env.js";
import { MAX_PIXELS, SLOTS, slotError, storedWidths } from "./slots.js";

// One libvips thread and no cache keep memory flat on a small server.
sharp.concurrency(1);
sharp.cache(false);

const TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** A stored file: `{uuid}.ext`, or a smaller copy `{uuid}-{width}.webp` of a slot image. */
export const FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.(jpg|png|webp)|-\d{2,4}\.webp)$/;
/** A main file name only (no width suffix). Uploads may be deleted by this name alone. */
export const MAIN_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export function uploadRoot() {
  return path.resolve(env.uploadDir);
}

export function ensureUploadDir() {
  fs.mkdirSync(uploadRoot(), { recursive: true });
}

export function sniffImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", contentType: TYPES.jpg };
  }
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(png)) {
    return { ext: "png", contentType: TYPES.png };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", contentType: TYPES.webp };
  }
  return null;
}

function localPath(filename) {
  if (!FILENAME.test(filename)) return "";
  const root = uploadRoot();
  const file = path.resolve(root, filename);
  if (file !== path.join(root, filename)) return "";
  return file;
}

export function contentTypeFor(filename) {
  return TYPES[filename.split(".").pop()] || "";
}

export function localFile(filename) {
  const file = localPath(filename);
  if (!file || !fs.existsSync(file)) return "";
  return file;
}

function s3Client() {
  return new S3Client({
    region: env.s3.region,
    credentials: {
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
    },
  });
}

export async function storeImage(buffer) {
  const sniffed = sniffImage(buffer);
  if (!sniffed) {
    const error = new Error("Use a JPEG, PNG, or WebP image.");
    error.status = 400;
    throw error;
  }

  const filename = `${randomUUID()}.${sniffed.ext}`;

  if (env.storageDriver === "local") {
    ensureUploadDir();
    const file = localPath(filename);
    await fs.promises.writeFile(file, buffer);
    return {
      storage: "local",
      key: filename,
      url: `/media/${filename}`,
      filename,
      contentType: sniffed.contentType,
    };
  }

  const key = `centres/${filename}`;
  await s3Client().send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: sniffed.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    storage: "s3",
    key,
    url: `${env.s3.publicBaseUrl}/${key}`,
    filename,
    contentType: sniffed.contentType,
  };
}

function slotError400(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/** Real pixel size after EXIF rotation. */
function orientedSize(meta) {
  const turned = meta.orientation >= 5 && meta.orientation <= 8;
  return turned ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
}

async function putFile(name, slot, body) {
  if (env.storageDriver === "local") {
    const file = localPath(name);
    if (!file) throw new Error("Bad file name.");
    await fs.promises.writeFile(file, body);
    return;
  }
  await s3Client().send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: `media/${slot}/${name}`,
      Body: body,
      ContentType: TYPES.webp,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

/**
 * Checks an upload against its slot (§6 IMG-2, IMG-3), then saves WebP copies at
 * each slot width with every bit of metadata removed (IMG-5). The original bytes
 * are never stored.
 */
export async function storeSlotImage(buffer, slotName, { allowOffSize = false } = {}) {
  if (!SLOTS[slotName]) throw slotError400("Choose where this image is used.");
  if (!sniffImage(buffer)) throw slotError400("Use a JPEG, PNG, or WebP image.");

  let meta;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
  } catch (error) {
    if (/pixel limit/i.test(String(error.message))) throw slotError400("Use an image under 40 megapixels.");
    throw slotError400("That image could not be read.");
  }
  if (!meta.width || !meta.height) throw slotError400("That image could not be read.");
  if (meta.width * meta.height > MAX_PIXELS) throw slotError400("Use an image under 40 megapixels.");

  const { width, height } = orientedSize(meta);
  // The seed may keep today's site photos that miss the rule; they are flagged for replacement.
  const problem = slotError(slotName, width, height);
  if (problem && !allowOffSize) throw slotError400(problem);

  const id = randomUUID();
  const widths = storedWidths(slotName, width);
  const files = [];
  try {
    if (env.storageDriver === "local") ensureUploadDir();
    for (const [index, targetWidth] of widths.entries()) {
      const name = index === 0 ? `${id}.webp` : `${id}-${targetWidth}.webp`;
      const output = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
        .rotate()
        .resize({ width: targetWidth, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
      await putFile(name, slotName, output.data);
      files.push({ name, width: output.info.width, height: output.info.height });
    }
  } catch (error) {
    await removeFiles(files.map((file) => file.name), slotName, env.storageDriver);
    throw error;
  }

  const base = env.storageDriver === "local" ? "/media" : `${env.s3.publicBaseUrl}/media/${slotName}`;
  const main = files[0];
  return {
    storage: env.storageDriver,
    key: env.storageDriver === "local" ? main.name : `media/${slotName}/${main.name}`,
    url: `${base}/${main.name}`,
    filename: main.name,
    contentType: TYPES.webp,
    slot: slotName,
    width: main.width,
    height: main.height,
    variants: files.map((file) => ({ width: file.width, url: `${base}/${file.name}` })),
    alt: "",
    ...(problem ? { needsReplacing: true, problem } : {}),
  };
}

async function removeFiles(names, slot, storage) {
  for (const name of names) {
    if (!FILENAME.test(name)) continue;
    try {
      if (storage === "local") {
        const file = localPath(name);
        if (file) await fs.promises.rm(file, { force: true });
      } else if (storage === "s3" && env.s3.bucket && slot && SLOTS[slot]) {
        await s3Client().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: `media/${slot}/${name}` }));
      }
    } catch (error) {
      console.error(redact(error.message));
    }
  }
}

/** Every stored file name of an image: the main file plus its smaller copies. */
export function storedNames(image) {
  if (!image?.filename || !MAIN_FILENAME.test(image.filename)) return [];
  const names = new Set([image.filename]);
  const id = image.filename.replace(/\.(jpg|png|webp)$/, "");
  for (const variant of image.variants || []) {
    const name = String(variant.url || "").split("/").pop();
    if (FILENAME.test(name) && name.startsWith(id)) names.add(name);
  }
  return [...names];
}

export async function deleteStoredImage(image) {
  if (!image?.filename || !MAIN_FILENAME.test(image.filename)) return;
  // Slot images (with a slot) keep several WebP copies; delete them all.
  if (image.slot) {
    await removeFiles(storedNames(image), image.slot, image.storage);
    return;
  }
  try {
    if (image.storage === "local") {
      const file = localPath(image.filename);
      if (file) await fs.promises.rm(file, { force: true });
      return;
    }
    if (image.storage === "s3" && env.s3.bucket && image.key === `centres/${image.filename}`) {
      await s3Client().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: image.key }));
    }
  } catch (error) {
    console.error(redact(error.message));
  }
}

/** Deletes the files of an upload known only by its main name (DELETE /api/admin/uploads/:filename). */
export async function deleteUploadByName(filename) {
  if (!MAIN_FILENAME.test(filename)) return;
  const id = filename.replace(/\.(jpg|png|webp)$/, "");
  if (env.storageDriver === "local") {
    const root = uploadRoot();
    let names = [];
    try {
      names = await fs.promises.readdir(root);
    } catch {
      return;
    }
    const mine = names.filter((name) => name === filename || (name.startsWith(`${id}-`) && FILENAME.test(name)));
    await removeFiles(mine, null, "local");
    return;
  }
  await deleteStoredImage({ storage: "s3", filename, key: `centres/${filename}` });
  if (filename.endsWith(".webp")) {
    for (const slot of Object.keys(SLOTS)) {
      const names = [filename, ...SLOTS[slot].widths.map((width) => `${id}-${width}.webp`)];
      await removeFiles(names, slot, "s3");
    }
  }
}
