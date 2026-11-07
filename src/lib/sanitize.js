import sanitizeHtml from "sanitize-html";

const BAD_SCHEME = /^\s*(javascript|data|vbscript|file):/i;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** A link the site may render: https, mailto, tel, or a site path. */
export function isSafeHref(value) {
  const href = String(value ?? "").trim();
  if (!href || CONTROL.test(href) || BAD_SCHEME.test(href)) return false;
  if (/^\/(?!\/)/.test(href)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(href)) return true;
  if (/^tel:\+?[0-9 ()-]{3,20}$/i.test(href)) return true;
  return isHttpsUrl(href);
}

/** An absolute https:// URL with a real host. */
export function isHttpsUrl(value) {
  const text = String(value ?? "").trim();
  if (!text || CONTROL.test(text) || /\s/.test(text)) return false;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && Boolean(url.hostname) && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** A site path or an https URL (news links). */
export function isSafeLink(value) {
  const text = String(value ?? "").trim();
  if (!text || CONTROL.test(text) || BAD_SCHEME.test(text)) return false;
  return /^\/(?!\/)\S*$/.test(text) || isHttpsUrl(text);
}

const INLINE = {
  allowedTags: ["strong", "em", "b", "i", "a", "br"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a(tagName, attribs) {
      const href = String(attribs.href || "").trim();
      if (!isSafeHref(href)) return { tagName: "a", attribs: {} };
      if (/^https:/i.test(href)) {
        return { tagName: "a", attribs: { href, target: "_blank", rel: "noopener noreferrer" } };
      }
      return { tagName: "a", attribs: { href } };
    },
  },
};

/** Inline rich text for paragraphs, list items and table cells (§4.3). */
export function sanitizeInline(value) {
  let clean = sanitizeHtml(String(value ?? ""), INLINE);
  // A refused link is left as a bare <a>; keep its words and drop the tag.
  let previous;
  do {
    previous = clean;
    clean = clean.replace(/<a>((?:(?!<a[\s>])[\s\S])*?)<\/a>/g, "$1");
  } while (clean !== previous);
  return clean.trim();
}

/** Plain text: every tag removed, entities kept as text. */
export function plainText(value) {
  return sanitizeHtml(String(value ?? ""), { allowedTags: [], allowedAttributes: {} }).trim();
}

/** Visible length of rich text, for limits. */
export function visibleLength(value) {
  return plainText(value).replace(/&[a-z]+;|&#\d+;/gi, "x").length;
}

const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);
const MAX_JSON_LD = 10 * 1024;

/**
 * Checks admin-entered JSON-LD (§4.1). Returns { value } with a normalised
 * JSON string, or { error }.
 */
export function checkJsonLd(input) {
  const text = String(input ?? "").trim();
  if (!text) return { value: "" };
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_LD) return { error: "Keep schema markup under 10 KB." };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "Schema markup must be valid JSON." };
  }
  const items = Array.isArray(data) ? data : [data];
  if (!items.length || items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    return { error: "Schema markup must be a JSON object or a list of objects." };
  }
  const first = items[0];
  if (!first["@context"] || !items.every((item) => item["@type"] || item["@graph"])) {
    return { error: "Schema markup needs @context and @type." };
  }
  return { value: JSON.stringify(data) };
}

/** JSON for a <script type="application/ld+json"> body. Stored text can never close the tag (SEO-3). */
export function jsonForScript(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LINE_SEP).join(" ")
    .split(PARA_SEP).join(" ");
}

/** Escapes a user search term for use inside a RegExp. */
export function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
