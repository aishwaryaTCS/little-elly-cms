/**
 * Helpers shared by the content routes: turning stored documents back into edit
 * bodies (so publish rules can re-check them), listing their images, and shaping
 * responses.
 */

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

function image(value) {
  if (!value) return null;
  const { storage, key, url, filename, contentType, slot, width, height, variants = [], alt = "", needsReplacing } = value;
  return {
    ...(needsReplacing ? { needsReplacing: true } : {}),
    storage,
    key,
    url,
    filename,
    contentType,
    slot,
    width,
    height,
    variants: variants.map((variant) => ({ width: variant.width, url: variant.url })),
    alt,
  };
}

function seo(value = {}) {
  return {
    metaTitle: value.metaTitle || "",
    metaDescription: value.metaDescription || "",
    keywords: value.keywords || [],
    canonicalUrl: value.canonicalUrl || "",
    robots: value.robots || "index,follow",
    ogImage: image(value.ogImage),
    schemaJsonLd: value.schemaJsonLd || "",
  };
}

function block(value) {
  switch (value.type) {
    case "p":
    case "h2":
    case "h3":
      return { type: value.type, text: value.text || "" };
    case "ul":
    case "ol":
      return { type: value.type, items: value.items || [] };
    case "image":
      return { type: "image", image: image(value.image) };
    case "table":
      return { type: "table", head: value.head || [], rows: value.rows || [] };
    default:
      return { type: value.type };
  }
}

const consent = (value = {}) => ({
  hasPeople: Boolean(value.hasPeople),
  photoAllowed: Boolean(value.photoAllowed),
  nameAllowed: Boolean(value.nameAllowed),
});

/** Edit-body shape of a stored document, per content type (matches validation/content.js). */
export const toBody = {
  teamMember(doc) {
    const extra = { consent: consent(doc.consent), seo: seo(doc.seo) };
    if (doc.kind === "group") return { kind: "group", name: doc.name, line: doc.line, photo: image(doc.photo), ...extra };
    return { kind: "person", name: doc.name, role: doc.role, note: doc.note, photo: image(doc.photo), ...extra };
  },
  award(doc) {
    return { issuer: doc.issuer, line: doc.line, image: image(doc.image), year: doc.year ?? null, consent: consent(doc.consent), seo: seo(doc.seo) };
  },
  program(doc) {
    return {
      slug: doc.slug,
      name: doc.name,
      ageLabel: doc.ageLabel,
      shortAge: doc.shortAge,
      line: doc.line,
      longDescription: doc.longDescription,
      learn: doc.learn || [],
      skills: doc.skills || [],
      ratio: { adults: doc.ratio?.adults ?? 1, children: doc.ratio?.children ?? 10 },
      accent: doc.accent,
      pageAgeLabel: doc.pageAgeLabel || "",
      pageLine: doc.pageLine || "",
      pageAccent: doc.pageAccent || doc.accent,
      cardPhoto: image(doc.cardPhoto),
      photo: image(doc.photo),
      seo: seo(doc.seo),
      consent: consent(doc.consent),
    };
  },
  testimonial(doc) {
    return { lead: doc.lead, highlight: doc.highlight, quote: doc.quote, name: doc.name, role: doc.role, photo: image(doc.photo), consent: consent(doc.consent), seo: seo(doc.seo) };
  },
  newsItem(doc) {
    return {
      tag: doc.tag,
      title: doc.title,
      line: doc.line,
      accent: doc.accent,
      image: image(doc.image),
      eventDate: iso(doc.eventDate),
      link: doc.link || "",
      consent: consent(doc.consent),
      seo: seo(doc.seo),
    };
  },
  blogPost(doc) {
    return {
      slug: doc.slug,
      title: doc.title,
      excerpt: doc.excerpt,
      category: doc.category ? String(doc.category._id || doc.category) : "",
      author: doc.author,
      publishedAt: iso(doc.publishedAt),
      coverImage: image(doc.coverImage),
      blocks: (doc.blocks || []).map(block),
      seo: seo(doc.seo),
      consent: consent(doc.consent),
    };
  },
};

/** Every image a stored document references (for retiring replaced or deleted files). */
export const imagesOf = {
  teamMember: (doc) => [doc.photo, doc.seo?.ogImage],
  award: (doc) => [doc.image, doc.seo?.ogImage],
  program: (doc) => [doc.cardPhoto, doc.photo, doc.seo?.ogImage],
  testimonial: (doc) => [doc.photo, doc.seo?.ogImage],
  newsItem: (doc) => [doc.image, doc.seo?.ogImage],
  blogPost: (doc) => [doc.coverImage, doc.seo?.ogImage, ...(doc.blocks || []).map((b) => b.image)],
  pageSeo: (doc) => [doc.seo?.ogImage],
  siteSettings: (doc) => [doc.defaultShareImage, doc.organization?.logo],
};

/** API shape: `id` instead of `_id`, no `__v`. */
export function present(doc) {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  const out = { id: String(_id), ...rest };
  if (rest.category && typeof rest.category === "object" && rest.category._id) {
    const { _id: categoryId, name, slug, accent } = rest.category;
    out.category = { id: String(categoryId), name, slug, accent };
  } else if (rest.category) {
    out.category = String(rest.category);
  }
  return out;
}

/** 400 response body in the same shape as middleware/validate.js. */
export function fieldErrors(error, message = "Check the highlighted fields.") {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return { error: message, fields };
}

export function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.extra = extra;
  return error;
}
