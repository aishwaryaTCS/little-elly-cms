/**
 * Public response shapes (CONTENT_CMS_SPEC.md §9.2). Every function lists the
 * fields the website uses and nothing else: no ids of other collections, no
 * storage keys, no drafts.
 */

/** Public image: what an <img> needs, no storage details. */
export function publicImage(image) {
  if (!image?.url) return null;
  return {
    url: image.url,
    width: image.width,
    height: image.height,
    alt: image.alt || "",
    variants: (image.variants || []).map((variant) => ({ width: variant.width, url: variant.url })),
  };
}

function parseJsonLd(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Resolved SEO for a page. Empty title/description/image fall back (BL-5), and an
 * empty canonical becomes `{siteOrigin}{path}`.
 */
export function publicSeo(seo = {}, { path, siteOrigin, fallback = {} }) {
  return {
    metaTitle: seo.metaTitle || fallback.title || "",
    metaDescription: seo.metaDescription || fallback.description || "",
    keywords: seo.keywords || [],
    canonicalUrl: seo.canonicalUrl || `${siteOrigin}${path}`,
    robots: seo.robots || "index,follow",
    ogImage: publicImage(seo.ogImage) || publicImage(fallback.image),
    schemaJsonLd: parseJsonLd(seo.schemaJsonLd),
  };
}

export function publicSiteSettings(doc) {
  return {
    siteName: doc?.siteName || "Little Elly",
    siteOrigin: doc?.siteOrigin || "https://littleelly.com",
    defaultShareImage: publicImage(doc?.defaultShareImage),
    organization: {
      legalName: doc?.organization?.legalName || "",
      logo: publicImage(doc?.organization?.logo),
      phone: doc?.organization?.phone || "",
      email: doc?.organization?.email || "",
      sameAs: doc?.organization?.sameAs || [],
    },
    googleSiteVerification: doc?.googleSiteVerification || "",
  };
}

export function publicPage(doc, siteOrigin) {
  return {
    pageKey: doc.pageKey,
    path: doc.path,
    seo: publicSeo(doc.seo, { path: doc.path, siteOrigin }),
    sections: doc.sections && Object.keys(doc.sections).length ? doc.sections : null,
    updatedAt: doc.updatedAt,
  };
}

/** A card's own schema markup (set in its SEO options), or null. */
const cardSchema = (doc) => parseJsonLd(doc.seo?.schemaJsonLd);

export const publicTeam = {
  person: (doc) => ({ name: doc.name, role: doc.role, note: doc.note || "", photo: publicImage(doc.photo), schema: cardSchema(doc) }),
  group: (doc) => ({ name: doc.name, line: doc.line || "", photo: publicImage(doc.photo), schema: cardSchema(doc) }),
};

export function publicAward(doc) {
  return { issuer: doc.issuer, line: doc.line, year: doc.year ?? null, image: publicImage(doc.image), schema: cardSchema(doc) };
}

export function publicTestimonial(doc) {
  return {
    lead: doc.lead,
    highlight: doc.highlight,
    quote: doc.quote,
    name: doc.name,
    role: doc.role,
    photo: publicImage(doc.photo),
    schema: cardSchema(doc),
  };
}

export function publicNews(doc) {
  return {
    tag: doc.tag,
    title: doc.title,
    line: doc.line,
    accent: doc.accent,
    image: publicImage(doc.image),
    eventDate: doc.eventDate || null,
    link: doc.link || "",
    schema: cardSchema(doc),
  };
}

const ratioLabel = (ratio) => `${ratio?.adults ?? 1} : ${ratio?.children ?? 1}`;

/** Card fields for the home carousel and the programs hero steps. */
export function publicProgramCard(doc) {
  return {
    slug: doc.slug,
    name: doc.name,
    ageLabel: doc.ageLabel,
    shortAge: doc.shortAge,
    line: doc.line,
    learn: doc.learn || [],
    accent: doc.accent,
    cardPhoto: publicImage(doc.cardPhoto),
  };
}

export function publicProgram(doc, siteOrigin) {
  const path = `/our-programs/${doc.slug}/`;
  return {
    ...publicProgramCard(doc),
    // The programs page and the program's own page use this set.
    page: { ageLabel: doc.pageAgeLabel || doc.ageLabel, line: doc.pageLine || doc.line, accent: doc.pageAccent || doc.accent },
    longDescription: doc.longDescription,
    skills: doc.skills || [],
    ratio: { adults: doc.ratio?.adults ?? 1, children: doc.ratio?.children ?? 1, label: ratioLabel(doc.ratio) },
    photo: publicImage(doc.photo),
    path,
    seo: publicSeo(doc.seo, {
      path,
      siteOrigin,
      fallback: { title: doc.name, description: doc.line, image: doc.photo },
    }),
    updatedAt: doc.updatedAt,
  };
}

export function publicCategory(doc) {
  if (!doc || typeof doc !== "object" || !doc.slug) return null;
  return { slug: doc.slug, name: doc.name, accent: doc.accent };
}

/** Blog card: no blocks (PERF-5). */
export function publicPostCard(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt,
    category: publicCategory(doc.category),
    publishedAt: doc.publishedAt,
    coverImage: publicImage(doc.coverImage),
    path: `/blogs/${doc.slug}`,
  };
}

/** Blocks in the shape the site already renders (src/content/blog-articles.ts). */
function publicBlock(block) {
  switch (block.type) {
    case "p":
    case "h2":
    case "h3":
      return { type: block.type, text: block.text || "" };
    case "ul":
    case "ol":
      return { type: block.type, items: block.items || [] };
    case "image": {
      const image = publicImage(block.image);
      if (!image) return null;
      return { type: "image", src: image.url, alt: image.alt, width: image.width, height: image.height, variants: image.variants };
    }
    case "table":
      return { type: "table", head: block.head || [], rows: block.rows || [] };
    default:
      return null;
  }
}

export function publicPost(doc, siteOrigin) {
  const card = publicPostCard(doc);
  return {
    ...card,
    author: doc.author || "",
    blocks: (doc.blocks || []).map(publicBlock).filter(Boolean),
    seo: publicSeo(doc.seo, {
      path: card.path,
      siteOrigin,
      fallback: { title: doc.title, description: doc.excerpt, image: doc.coverImage },
    }),
    updatedAt: doc.updatedAt,
  };
}
