/**
 * SEO fields (CONTENT_CMS_SPEC.md §4.1) with a Google-style search preview (BL-4).
 * Title and description show first; the rest sits under "More SEO options".
 * Every item shows its own read-only ID so two items are never confused.
 */
import { useId, useState } from "react";
import { ImageSlot } from "./imageSlot.jsx";
import { TextField } from "./ui.jsx";

const SITE = "https://littleelly.com";
const SCHEMA_TYPES = ["Article", "BlogPosting", "Course", "Event", "FAQPage", "ImageObject", "Organization", "Person", "Review"];

function cut(text, max) {
  const clean = String(text || "").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function SearchPreview({ title, description, path }) {
  const crumbs = ["littleelly.com", ...String(path || "/").split("/").filter(Boolean)].join(" › ");
  return (
    <div className="serp" aria-label="Search result preview">
      <p className="serp-url">{crumbs}</p>
      <p className="serp-title">{cut(title, 60) || "Search title"}</p>
      <p className="serp-desc">{cut(description, 160) || "Search description shows here."}</p>
    </div>
  );
}

function checkJsonLd(text) {
  if (!text.trim()) return "";
  if (new Blob([text]).size > 10 * 1024) return "Keep schema markup under 10 KB.";
  try {
    const data = JSON.parse(text);
    const items = Array.isArray(data) ? data : [data];
    if (!items.length || items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) return "Use a JSON object or a list of objects.";
    if (!items[0]["@context"] || !items.every((item) => item["@type"] || item["@graph"])) return "Add @context and @type.";
    return "";
  } catch {
    return "This is not valid JSON.";
  }
}

/** Builds schema markup for the chosen type from the item's own details. */
function autoSchema(type, info, url) {
  const name = info?.name || "";
  const description = info?.description || "";
  const image = info?.image || undefined;
  const base = { "@context": "https://schema.org", "@type": type };
  switch (type) {
    case "Article":
    case "BlogPosting":
      return { ...base, headline: name, description, image, author: info?.author ? { "@type": "Person", name: info.author } : undefined, mainEntityOfPage: url };
    case "Course":
      return { ...base, name, description, provider: { "@type": "Organization", name: "Little Elly", sameAs: SITE } };
    case "Event":
      return { ...base, name, description, image, startDate: info?.date || undefined, organizer: { "@type": "Organization", name: "Little Elly" } };
    case "FAQPage":
      return { ...base, mainEntity: [{ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text: description } }] };
    case "Person":
      return { ...base, name, jobTitle: info?.role || undefined, image, worksFor: { "@type": "Organization", name: "Little Elly" } };
    case "Review":
      return { ...base, reviewBody: description, author: { "@type": "Person", name }, itemReviewed: { "@type": "Preschool", name: "Little Elly" } };
    case "Organization":
      return { ...base, name, description, logo: image, url: SITE };
    default:
      return { ...base, name, description, contentUrl: image };
  }
}

function Keywords({ value, onChange, error }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  function add() {
    const word = draft.trim();
    if (!word) return;
    if (!value.some((item) => item.toLowerCase() === word.toLowerCase()) && value.length < 10) onChange([...value, word.slice(0, 40)]);
    setDraft("");
  }
  return (
    <div className="field">
      <span className="field-top">
        <label htmlFor={id}>Search keywords</label>
        <span className="counter">{value.length}/10</span>
      </span>
      <div className="inline single">
        <input
          id={id}
          value={draft}
          maxLength={40}
          placeholder="Type, then Enter"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn small" onClick={add} disabled={!draft.trim() || value.length >= 10}>
          Add
        </button>
      </div>
      <div className="chips">
        {value.map((word) => (
          <span key={word} className="chip">
            {word}
            <button type="button" aria-label={`Remove ${word}`} onClick={() => onChange(value.filter((item) => item !== word))}>
              ×
            </button>
          </span>
        ))}
      </div>
      {error ? <em className="error-text">{error}</em> : null}
    </div>
  );
}

/**
 * @param fallback  { title, description } used when the fields are empty (BL-5); without it they are required
 * @param path      page path, for the preview and the default canonical
 * @param itemId    the item's unique ID (read-only)
 * @param info      details used to auto-build schema markup: { name, description, image, author, role, date }
 * @param schemaType default schema type for "Generate"
 */
export function SeoFields({ value, onChange, errors = {}, prefix = "seo", fallback, path, itemId, info, schemaType = "Article" }) {
  const seo = value || {};
  const set = (key, next) => onChange({ ...seo, [key]: next });
  const err = (key) => errors[`${prefix}.${key}`];
  const [more, setMore] = useState(false);
  const [type, setType] = useState(schemaType);
  const [schemaNote, setSchemaNote] = useState("");
  const robotsName = useId();
  const url = seo.canonicalUrl || `${SITE}${path || "/"}`;
  const moreErrors = ["keywords", "canonicalUrl", "ogImage", "schemaJsonLd"].some((key) => Object.keys(errors).some((e) => e.startsWith(`${prefix}.${key}`)));

  function generate() {
    const json = JSON.stringify(autoSchema(type, info, url), null, 2);
    set("schemaJsonLd", json);
    setSchemaNote("");
  }

  return (
    <div className="seo-fields">
      <div className="seo-main">
        <div className="grid-2">
          <TextField
            label="Search title"
            value={seo.metaTitle}
            max={60}
            min={fallback ? 0 : 10}
            placeholder={fallback?.title ? cut(fallback.title, 60) : ""}
            hint={fallback ? "Empty uses the title." : undefined}
            error={err("metaTitle")}
            onChange={(next) => set("metaTitle", next)}
          />
          <TextField
            area
            rows={2}
            label="Search description"
            value={seo.metaDescription}
            max={160}
            min={fallback ? 0 : 50}
            placeholder={fallback?.description ? cut(fallback.description, 160) : ""}
            hint={fallback ? "Empty uses the summary." : undefined}
            error={err("metaDescription")}
            onChange={(next) => set("metaDescription", next)}
          />
        </div>
        <SearchPreview title={seo.metaTitle || fallback?.title} description={seo.metaDescription || fallback?.description} path={path} />
      </div>

      <button type="button" className="btn small ghost more-toggle" aria-expanded={more || moreErrors} onClick={() => setMore((v) => !v)}>
        {more || moreErrors ? "Fewer SEO options" : "More SEO options"}
      </button>

      {more || moreErrors ? (
        <div className="grid-2">
          {itemId ? (
            <div className="field">
              <label htmlFor={`${robotsName}-id`}>Unique ID</label>
              <input id={`${robotsName}-id`} value={itemId} readOnly className="mono readonly" />
              <small className="help">Fixed. Not shown on the website.</small>
            </div>
          ) : null}
          <Keywords value={seo.keywords || []} onChange={(next) => set("keywords", next)} error={err("keywords")} />
          <TextField
            label="Canonical link"
            value={seo.canonicalUrl}
            max={500}
            placeholder={`${SITE}${path || "/"}`}
            hint="Only if this copies another page."
            error={err("canonicalUrl")}
            onChange={(next) => set("canonicalUrl", next)}
          />
          <fieldset className="field robots">
            <legend>In search engines</legend>
            <label className={seo.robots !== "noindex,nofollow" ? "choice on" : "choice"}>
              <input type="radio" name={robotsName} checked={seo.robots !== "noindex,nofollow"} onChange={() => set("robots", "index,follow")} />
              <span>
                <b>Show</b>
                <small>index, follow</small>
              </span>
            </label>
            <label className={seo.robots === "noindex,nofollow" ? "choice on" : "choice"}>
              <input type="radio" name={robotsName} checked={seo.robots === "noindex,nofollow"} onChange={() => set("robots", "noindex,nofollow")} />
              <span>
                <b>Hide</b>
                <small>noindex, nofollow</small>
              </span>
            </label>
          </fieldset>
          <div className="span-2">
            <ImageSlot
              slot="share"
              label="Share image"
              optional
              value={seo.ogImage}
              onChange={(image) => set("ogImage", image)}
              error={err("ogImage")}
              altError={err("ogImage.alt")}
            />
          </div>
          <div className="field span-2 schema">
            <span className="field-top">
              <label htmlFor={`${robotsName}-type`}>Schema markup</label>
              <span className="row-actions">
                <select id={`${robotsName}-type`} value={type} onChange={(e) => setType(e.target.value)} aria-label="Schema type">
                  {SCHEMA_TYPES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn small" onClick={generate}>
                  Generate
                </button>
                {seo.schemaJsonLd ? (
                  <button type="button" className="btn small ghost" onClick={() => set("schemaJsonLd", "")}>
                    Clear
                  </button>
                ) : null}
              </span>
            </span>
            <TextField
              area
              mono
              rows={6}
              label="JSON-LD"
              hint="Generate from this item, then edit if needed."
              value={seo.schemaJsonLd}
              error={err("schemaJsonLd") || schemaNote}
              onChange={(next) => {
                set("schemaJsonLd", next);
                setSchemaNote(checkJsonLd(next));
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
