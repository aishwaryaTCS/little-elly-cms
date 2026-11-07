/**
 * One router factory for every ordered content list (CONTENT_CMS_SPEC.md §9.1):
 * list, read, create (draft), replace, publish/unpublish, reorder, delete.
 *
 * Rules applied here:
 *  BR-1 drafts stay drafts until published     BR-2 sortOrder in steps of 10
 *  BR-3 publish re-checks every required field  BR-4 min/max live items per section
 *  BR-8 replaced and deleted images are retired BR-9 typed confirmation on delete
 */
import { Router } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../lib/async.js";
import { fieldErrors, httpError, imagesOf, present, toBody } from "../lib/content.js";
import { retireReplaced } from "../lib/images.js";
import { assertUniqueSeo } from "../lib/seoUnique.js";
import { contentSchemas, reorderSchema, statusSchema } from "../validation/content.js";

/**
 * @param {object} def
 * @param {import("mongoose").Model} def.Model
 * @param {string} def.type          key in contentSchemas / toBody / imagesOf
 * @param {string} def.noun          "team member", used in messages
 * @param {(doc) => {filter: object, min: number, max: number, label: string}} def.limits
 * @param {boolean} [def.slugConfirm] delete needs ?confirm=<slug>
 * @param {(doc) => object} [def.beforePublish] fills defaults before the publish check
 * @param {(doc, session) => Promise<void>} [def.onUnpublish]
 * @param {(req) => object} [def.listFilter]
 * @param {(body) => Promise<void>} [def.verify]   extra checks that need the database
 * @param {boolean} [def.orderable=true]           false: no reorder route (blog posts sort by date)
 */
export function contentRouter(def) {
  const router = Router();
  const { Model, type, noun } = def;
  const verify = def.verify || (async () => {});
  const notFound = () => httpError(404, `${noun[0].toUpperCase()}${noun.slice(1)} not found.`);

  async function load(id) {
    if (!mongoose.isValidObjectId(id)) throw notFound();
    const doc = await Model.findById(id);
    if (!doc) throw notFound();
    return doc;
  }

  function check(mode, body) {
    const result = contentSchemas[mode][type].safeParse(body);
    if (!result.success) {
      const message = mode === "publish" ? "Fill in the highlighted fields to publish." : "Check the highlighted fields.";
      throw httpError(400, message, { fields: fieldErrors(result.error).fields });
    }
    return result.data;
  }

  async function liveCount(doc, exceptId) {
    const { filter } = def.limits(doc);
    return Model.countDocuments({ ...filter, status: "published", _id: { $ne: exceptId } });
  }

  /** BR-4: taking the last live item off the site needs `hideSection`. */
  async function guardHide(doc, confirmed) {
    if (doc.status !== "published") return;
    const { min } = def.limits(doc);
    if (min < 1 || confirmed) return;
    if ((await liveCount(doc, doc._id)) < min) {
      throw httpError(409, "This hides the section on the website.", { needsConfirm: true });
    }
  }

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const filter = def.listFilter ? def.listFilter(req) : {};
      const items = await Model.find(filter).sort({ sortOrder: 1, createdAt: 1 }).limit(500).lean();
      res.json({ items: items.map(present) });
    }),
  );

  router.post(
    "/reorder",
    asyncHandler(async (req, res, next) => {
      if (def.orderable === false) return next();
      const parsed = reorderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(fieldErrors(parsed.error));
      const ids = parsed.data.ids;
      const found = await Model.countDocuments({ _id: { $in: ids } });
      if (found !== ids.length) return res.status(400).json({ error: "Some items no longer exist. Reload and try again." });
      await Model.bulkWrite(
        ids.map((id, index) => ({
          updateOne: { filter: { _id: id }, update: { $set: { sortOrder: (index + 1) * 10 } } },
        })),
      );
      const items = await Model.find({ _id: { $in: ids } }).sort({ sortOrder: 1 }).lean();
      res.json({ items: items.map(present) });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const doc = await load(req.params.id);
      res.json({ item: present(doc.toObject()) });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = check("draft", req.body);
      await verify(body);
      await assertUniqueSeo(body.seo, null);
      const last = await Model.findOne().sort({ sortOrder: -1 }).select("sortOrder").lean();
      const sortOrder = Math.min(9999, (last?.sortOrder ?? 0) + 10);
      const doc = await Model.create({ ...body, status: "draft", sortOrder });
      res.status(201).json({ item: present(doc.toObject()) });
    }),
  );

  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      const doc = await load(req.params.id);
      if (type === "teamMember" && req.body?.kind && req.body.kind !== doc.kind) {
        return res.status(400).json({ error: "Create a new item to change its type.", fields: { kind: "This cannot change." } });
      }
      // A live item must stay complete, so it is checked with the publish rules.
      const body = check(doc.status === "published" ? "publish" : "draft", req.body);
      await verify(body);
      await assertUniqueSeo(body.seo, doc._id);
      const before = imagesOf[type](doc.toObject());
      doc.set(body);
      await doc.save();
      await retireReplaced(before, imagesOf[type](doc.toObject()));
      res.json({ item: present(doc.toObject()) });
    }),
  );

  router.patch(
    "/:id/status",
    asyncHandler(async (req, res) => {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json(fieldErrors(parsed.error));
      const { status, hideSection } = parsed.data;
      const doc = await load(req.params.id);
      if (doc.status === status) return res.json({ item: present(doc.toObject()) });

      if (status === "published") {
        if (def.beforePublish) def.beforePublish(doc);
        await verify(check("publish", toBody[type](doc.toObject())));
        const { max, label } = def.limits(doc);
        if ((await liveCount(doc, doc._id)) >= max) {
          throw httpError(409, `Only ${max} ${label} can be live. Unpublish one first.`);
        }
        doc.status = "published";
        await doc.save();
      } else {
        await guardHide(doc, hideSection);
        doc.status = "draft";
        if (def.onUnpublish) def.onUnpublish(doc);
        await doc.save();
      }
      res.json({ item: present(doc.toObject()) });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const doc = await load(req.params.id);
      if (def.slugConfirm && doc.slug && String(req.query.confirm || "") !== doc.slug) {
        return res.status(400).json({ error: `Type ${doc.slug} to confirm.`, fields: { confirm: "Type the slug exactly." } });
      }
      await guardHide(doc, req.query.hideSection === "true");
      const images = imagesOf[type](doc.toObject());
      await doc.deleteOne();
      await retireReplaced(images, []);
      res.json({ ok: true });
    }),
  );

  return router;
}
