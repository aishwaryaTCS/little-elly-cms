/**
 * Phase 4 tests: content seed (CONTENT_CMS_SPEC.md SD-1..SD-3).
 * Run after `npm run seed:content`. Checks the seeded data, then runs the seed
 * again and proves it changes nothing and keeps admin edits.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, describe, test } from "node:test";
import mongoose from "mongoose";
import { env } from "../src/config/env.js";
import { uploadRoot } from "../src/lib/storage.js";
import * as models from "../src/models/content.js";

const run = promisify(execFile);
const { Award, BlogCategory, BlogPost, NewsItem, PageSeo, Program, SiteSettings, TeamMember, Testimonial } = models;

async function counts() {
  const out = {};
  for (const [name, Model] of Object.entries(models)) out[name] = await Model.countDocuments();
  out.files = fs.readdirSync(uploadRoot()).length;
  return out;
}

before(async () => {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  assert.ok(await PageSeo.countDocuments(), "Run npm run seed:content before these tests.");
});

after(() => mongoose.disconnect());

describe("seeded content", () => {
  test("every content type and every page is present", async () => {
    assert.ok(await TeamMember.countDocuments({ kind: "person", status: "published" }));
    assert.ok(await Award.countDocuments({ status: "published" }));
    assert.ok(await Program.countDocuments({ status: "published" }));
    assert.ok(await Testimonial.countDocuments({ status: "published" }));
    assert.ok(await NewsItem.countDocuments({ status: "published" }));
    assert.ok(await BlogCategory.countDocuments());
    assert.ok(await BlogPost.countDocuments({ status: "published" }));
    assert.equal(await PageSeo.countDocuments(), 15);
    assert.ok(await SiteSettings.exists({ key: "site" }));
  });

  test("at most one featured post, and it is live", async () => {
    const featured = await BlogPost.find({ featured: true }).lean();
    assert.ok(featured.length <= 1);
    for (const post of featured) assert.equal(post.status, "published");
  });

  test("headings are plain text and every post has an author", async () => {
    for (const post of await BlogPost.find().select("slug author blocks").lean()) {
      assert.ok(post.author, `${post.slug} has an author`);
      for (const block of post.blocks) {
        if (block.type === "h2" || block.type === "h3") assert.doesNotMatch(block.text, /</, `${post.slug}: ${block.text}`);
        if (block.type === "p") assert.doesNotMatch(block.text, /<script|on\w+=/i);
      }
    }
  });

  test("every stored image is WebP, has alt text and its files exist", async () => {
    const images = [];
    const collect = (value) => {
      if (Array.isArray(value)) return value.forEach(collect);
      if (!value || typeof value !== "object" || value instanceof Date || value instanceof mongoose.Types.ObjectId) return;
      if (value.filename && value.slot) images.push(value);
      Object.values(value).forEach(collect);
    };
    for (const Model of Object.values(models)) collect(await Model.find().lean());
    assert.ok(images.length > 0);
    for (const image of images) {
      assert.equal(image.contentType, "image/webp");
      assert.ok(image.alt?.length >= 5, `${image.filename} has alt text`);
      for (const variant of image.variants) {
        assert.ok(fs.existsSync(path.join(uploadRoot(), variant.url.split("/").pop())), variant.url);
      }
    }
  });
});

describe("running the seed again", { concurrency: false }, () => {
  test("adds nothing, copies no photos and keeps admin edits (SD-3)", async () => {
    const member = await TeamMember.findOne({ kind: "person" }).lean();
    const page = await PageSeo.findOne({ pageKey: "about" }).lean();
    await TeamMember.updateOne({ _id: member._id }, { $set: { note: "zz-edited by an admin" } });
    await PageSeo.updateOne({ _id: page._id }, { $set: { "seo.metaTitle": "zz-edited title" } });
    const deleted = await NewsItem.findOne().lean();
    await NewsItem.deleteOne({ _id: deleted._id });

    try {
      const before = await counts();
      const { stdout } = await run(process.execPath, ["src/seed/seedContent.js"], { timeout: 300000 });
      const after = await counts();
      assert.deepEqual(after, before, "no documents or files added");
      assert.doesNotMatch(stdout, /added /);
      assert.equal((await TeamMember.findById(member._id).lean()).note, "zz-edited by an admin");
      assert.equal((await PageSeo.findById(page._id).lean()).seo.metaTitle, "zz-edited title");
      assert.equal(await NewsItem.exists({ _id: deleted._id }), null, "a deleted item does not come back");
    } finally {
      await TeamMember.updateOne({ _id: member._id }, { $set: { note: member.note } });
      await PageSeo.updateOne({ _id: page._id }, { $set: { "seo.metaTitle": page.seo.metaTitle } });
      await NewsItem.collection.insertOne(deleted);
    }
  });
});
