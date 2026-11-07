/**
 * One definition per ordered content type: API path, labels, the edit body,
 * the form fields, the live preview and the section heading it owns (§4.4).
 */
import { ImageSlot } from "./imageSlot.jsx";
import { AwardPreview, NewsPreview, ProgramPreview, TeamGroupPreview, TeamPersonPreview, VoicePreview } from "./previews.jsx";
import { AccentPicker, emptyConsent, Panels, TextField, toConsent } from "./ui.jsx";

const image = (value) => (value ? { ...value } : null);
const seo = (value = {}) => ({
  metaTitle: value.metaTitle || "",
  metaDescription: value.metaDescription || "",
  keywords: value.keywords || [],
  canonicalUrl: value.canonicalUrl || "",
  robots: value.robots || "index,follow",
  ogImage: image(value.ogImage),
  schemaJsonLd: value.schemaJsonLd || "",
});

/** A fixed or ranged list of short lines (learn points, skills). */
function LinesField({ label, item, value, onChange, max, count, minCount, maxCount, errors, path, hint }) {
  const lines = value || [];
  const fixed = Boolean(count);
  const rows = fixed ? Array.from({ length: count }, (_, index) => lines[index] ?? "") : lines;
  const update = (index, next) => onChange(rows.map((line, i) => (i === index ? next : line)));
  return (
    <fieldset className="field span-2 lines">
      <legend>{label}</legend>
      {hint ? <small className="help">{hint}</small> : null}
      {rows.map((line, index) => (
        <div className="inline single" key={index}>
          <TextField label={`${item} ${index + 1}`} value={line} max={max} error={errors[`${path}.${index}`]} onChange={(next) => update(index, next)} />
          {!fixed ? (
            <button type="button" className="btn small" onClick={() => onChange(rows.filter((_, i) => i !== index))} aria-label={`Remove ${item} ${index + 1}`}>
              Remove
            </button>
          ) : null}
        </div>
      ))}
      {!fixed && rows.length < maxCount ? (
        <button type="button" className="btn ghost" onClick={() => onChange([...rows, ""])}>
          Add
        </button>
      ) : null}
      {!fixed ? <small className="help">{minCount}–{maxCount} items.</small> : null}
      {errors[path] ? <em className="error-text">{errors[path]}</em> : null}
    </fieldset>
  );
}

export const TYPES = {
  team: {
    key: "team",
    api: "/api/admin/team",
    route: "/website/team",
    title: "Our team",
    lead: "People and group photos on the About page.",
    noun: "team member",
    kinds: {
      person: { label: "People", add: "Add person", noun: "person", limit: { min: 1, max: 12 } },
      group: { label: "Group photos", add: "Add group photo", noun: "group photo", limit: { min: 0, max: 4 } },
    },
    section: { pageKey: "about", key: "team", label: "Our team heading" },
    empty: (kind = "person") =>
      kind === "group"
        ? { kind: "group", name: "", line: "", photo: null, consent: emptyConsent(), seo: seo() }
        : { kind: "person", name: "", role: "", note: "", photo: null, consent: emptyConsent(), seo: seo() },
    toBody: (item) =>
      item.kind === "group"
        ? { kind: "group", name: item.name || "", line: item.line || "", photo: image(item.photo), consent: toConsent(item.consent), seo: seo(item.seo) }
        : { kind: "person", name: item.name || "", role: item.role || "", note: item.note || "", photo: image(item.photo), consent: toConsent(item.consent), seo: seo(item.seo) },
    itemTitle: (item) => item.name || "Untitled",
    itemSub: (item) => (item.kind === "group" ? "Group photo" : item.role),
    images: (item) => [item.photo],
    seoPath: "/about-us/",
    schemaType: "Person",
    seoInfo: (doc) => ({ name: doc.name, description: doc.note || doc.line, role: doc.role, image: doc.photo?.url }),
    seoFallback: (doc) => ({ title: doc.name, description: doc.note || doc.line }),
    Preview: ({ doc }) => (doc.kind === "group" ? <TeamGroupPreview doc={doc} /> : <TeamPersonPreview doc={doc} />),
    Form({ doc, set, errors }) {
      const group = doc.kind === "group";
      return (
        <div className="grid-2">
          <TextField label={group ? "Group name" : "Name"} value={doc.name} max={40} min={2} error={errors.name} onChange={(v) => set("name", v)} />
          {group ? null : <TextField label="Role" value={doc.role} max={50} min={2} error={errors.role} onChange={(v) => set("role", v)} />}
          {group ? (
            <TextField wide area rows={2} label="Line" value={doc.line} max={120} error={errors.line} onChange={(v) => set("line", v)} />
          ) : (
            <TextField wide area rows={2} label="Note" hint="Optional. Shows on hover." value={doc.note} max={90} error={errors.note} onChange={(v) => set("note", v)} />
          )}
          <div className="span-2">
            <ImageSlot slot={group ? "teamGroup" : "teamPerson"} label="Photo" value={doc.photo} onChange={(v) => set("photo", v)} error={errors.photo} altError={errors["photo.alt"]} />
          </div>
        </div>
      );
    },
  },

  awards: {
    key: "awards",
    api: "/api/admin/awards",
    route: "/website/awards",
    title: "Awards & recognition",
    lead: "The awards carousel on the About page.",
    noun: "award",
    add: "Add award",
    limit: { min: 1, max: 20 },
    section: { pageKey: "about", key: "awards", label: "Awards heading", lead: true },
    empty: () => ({ issuer: "", line: "", image: null, year: null, consent: emptyConsent(), seo: seo() }),
    toBody: (item) => ({ issuer: item.issuer || "", line: item.line || "", image: image(item.image), year: item.year ?? null, consent: toConsent(item.consent), seo: seo(item.seo) }),
    itemTitle: (item) => item.issuer || "Untitled",
    itemSub: (item) => item.line,
    images: (item) => [item.image],
    seoPath: "/about-us/",
    schemaType: "ImageObject",
    seoInfo: (doc) => ({ name: doc.issuer, description: doc.line, image: doc.image?.url }),
    seoFallback: (doc) => ({ title: doc.issuer, description: doc.line }),
    Preview: AwardPreview,
    Form({ doc, set, errors }) {
      return (
        <div className="grid-2">
          <TextField label="Given by" value={doc.issuer} max={40} min={2} error={errors.issuer} onChange={(v) => set("issuer", v)} />
          <TextField
            label="Year"
            hint="Optional."
            value={doc.year ?? ""}
            error={errors.year}
            inputProps={{ inputMode: "numeric", maxLength: 4 }}
            onChange={(v) => set("year", v === "" ? null : Number.isNaN(Number(v)) ? v : Number(v))}
          />
          <TextField wide area rows={2} label="Line" value={doc.line} max={90} min={10} error={errors.line} onChange={(v) => set("line", v)} />
          <div className="span-2">
            <ImageSlot slot="award" label="Award image" value={doc.image} onChange={(v) => set("image", v)} error={errors.image} altError={errors["image.alt"]} />
          </div>
        </div>
      );
    },
  },

  programs: {
    key: "programs",
    api: "/api/admin/programs",
    route: "/website/programs",
    title: "Programs",
    lead: "Home page carousel, the programs page, and each program's own page.",
    noun: "program",
    add: "Add program",
    limit: { min: 1, max: 7 },
    slugged: true,
    section: { pageKey: "home", key: "programs", label: "Programs heading (home page)" },
    empty: () => ({
      slug: "",
      name: "",
      ageLabel: "",
      shortAge: "",
      line: "",
      longDescription: "",
      learn: ["", "", ""],
      skills: ["", "", "", ""],
      ratio: { adults: 1, children: 10 },
      accent: "coral",
      pageAgeLabel: "",
      pageLine: "",
      pageAccent: "coral",
      cardPhoto: null,
      photo: null,
      seo: seo(),
      consent: emptyConsent(),
    }),
    toBody: (item) => ({
      slug: item.slug || "",
      name: item.name || "",
      ageLabel: item.ageLabel || "",
      shortAge: item.shortAge || "",
      line: item.line || "",
      longDescription: item.longDescription || "",
      learn: item.learn || [],
      skills: item.skills || [],
      ratio: { adults: item.ratio?.adults ?? 1, children: item.ratio?.children ?? 10 },
      accent: item.accent || "coral",
      pageAgeLabel: item.pageAgeLabel || "",
      pageLine: item.pageLine || "",
      pageAccent: item.pageAccent || item.accent || "coral",
      cardPhoto: image(item.cardPhoto),
      photo: image(item.photo),
      seo: seo(item.seo),
      consent: toConsent(item.consent),
    }),
    itemTitle: (item) => item.name || "Untitled",
    itemSub: (item) => [item.ageLabel, item.slug && `/our-programs/${item.slug}/`].filter(Boolean).join(" · "),
    images: (item) => [item.cardPhoto, item.photo],
    seoPath: (doc) => `/our-programs/${doc.slug || "slug"}/`,
    schemaType: "Course",
    seoInfo: (doc) => ({ name: doc.name, description: doc.longDescription, image: doc.photo?.url }),
    Preview: ProgramPreview,
    Form({ doc, set, errors }) {
      const ratio = (key, value) => set("ratio", { ...doc.ratio, [key]: value === "" ? "" : Number(value) });
      return (
        <Panels
          items={[
            {
              title: "Basics",
              content: (
            <div className="grid-2">
              <TextField label="Name" value={doc.name} max={30} min={2} error={errors.name} onChange={(v) => set("name", v)} />
              <TextField label="URL slug" hint="Lowercase words joined by hyphens." value={doc.slug} max={120} error={errors.slug} onChange={(v) => set("slug", v.toLowerCase())} />
              <TextField label="Short age" hint="For the steps, e.g. 3y+." value={doc.shortAge} max={8} min={2} error={errors.shortAge} onChange={(v) => set("shortAge", v)} />
              <div className="field ratio-field">
                <span className="label">Adults to children</span>
                <span className="inline ratio">
                  <input aria-label="Adults" inputMode="numeric" value={doc.ratio?.adults ?? ""} onChange={(e) => ratio("adults", e.target.value)} />
                  <span aria-hidden="true">:</span>
                  <input aria-label="Children" inputMode="numeric" value={doc.ratio?.children ?? ""} onChange={(e) => ratio("children", e.target.value)} />
                </span>
                {errors["ratio.adults"] || errors["ratio.children"] ? <em className="error-text">{errors["ratio.adults"] || errors["ratio.children"]}</em> : null}
              </div>
              <TextField wide area rows={4} label="Description" value={doc.longDescription} max={400} min={50} error={errors.longDescription} onChange={(v) => set("longDescription", v)} />
              <LinesField label="Skills" item="Skill" value={doc.skills} onChange={(v) => set("skills", v)} max={40} minCount={4} maxCount={8} errors={errors} path="skills" />
            </div>
              ),
            },
            {
              title: "Home page carousel",
              content: (
            <div className="grid-2">
              <TextField label="Age" hint="e.g. 3 years +" value={doc.ageLabel} max={20} min={2} error={errors.ageLabel} onChange={(v) => set("ageLabel", v)} />
              <TextField label="Line" value={doc.line} max={60} min={10} error={errors.line} onChange={(v) => set("line", v)} />
              <AccentPicker label="Colour" value={doc.accent} error={errors.accent} onChange={(v) => set("accent", v)} />
              <LinesField label="What they learn" item="Point" hint="Exactly 3 points." value={doc.learn} count={3} onChange={(v) => set("learn", v)} max={50} errors={errors} path="learn" />
              <div className="span-2">
                <ImageSlot slot="programCard" label="Circle photo" value={doc.cardPhoto} onChange={(v) => set("cardPhoto", v)} error={errors.cardPhoto} altError={errors["cardPhoto.alt"]} />
              </div>
            </div>
              ),
            },
            {
              title: "Programs page",
              content: (
            <div className="grid-2">
              <TextField label="Age" value={doc.pageAgeLabel} max={20} min={2} error={errors.pageAgeLabel} onChange={(v) => set("pageAgeLabel", v)} />
              <TextField label="Line" value={doc.pageLine} max={60} min={10} error={errors.pageLine} onChange={(v) => set("pageLine", v)} />
              <AccentPicker label="Colour" value={doc.pageAccent} error={errors.pageAccent} onChange={(v) => set("pageAccent", v)} />
              <div className="span-2">
                <ImageSlot slot="programDetail" label="Page photo" value={doc.photo} onChange={(v) => set("photo", v)} error={errors.photo} altError={errors["photo.alt"]} />
              </div>
            </div>
              ),
            },
          ]}
        />
      );
    },
  },

  testimonials: {
    key: "testimonials",
    api: "/api/admin/testimonials",
    route: "/website/parent-voices",
    title: "Parent voices",
    lead: "The rotating parent quotes on the home page.",
    noun: "parent voice",
    add: "Add parent voice",
    limit: { min: 1, max: 12 },
    section: { pageKey: "home", key: "voices", label: "Parent voices heading" },
    empty: () => ({ lead: "I am glad I chose Little Elly because", highlight: "", quote: "", name: "", role: "", photo: null, consent: emptyConsent(), seo: seo() }),
    toBody: (item) => ({
      lead: item.lead || "",
      highlight: item.highlight || "",
      quote: item.quote || "",
      name: item.name || "",
      role: item.role || "",
      photo: image(item.photo),
      consent: toConsent(item.consent),
      seo: seo(item.seo),
    }),
    itemTitle: (item) => item.name || "Untitled",
    itemSub: (item) => item.role,
    images: (item) => [item.photo],
    seoPath: "/",
    schemaType: "Review",
    seoInfo: (doc) => ({ name: doc.name, description: doc.quote, image: doc.photo?.url }),
    seoFallback: (doc) => ({ title: doc.name, description: doc.highlight }),
    Preview: VoicePreview,
    Form({ doc, set, errors }) {
      return (
        <div className="grid-2">
          <TextField label="Parent name" value={doc.name} max={50} min={2} error={errors.name} onChange={(v) => set("name", v)} />
          <TextField label="Relation" hint="e.g. Mother of Riaan, Nursery" value={doc.role} max={60} min={2} error={errors.role} onChange={(v) => set("role", v)} />
          <TextField wide label="Opening line" value={doc.lead} max={50} min={5} error={errors.lead} onChange={(v) => set("lead", v)} />
          <TextField wide area rows={2} label="Highlight" hint="The big line." value={doc.highlight} max={140} min={10} error={errors.highlight} onChange={(v) => set("highlight", v)} />
          <TextField wide area rows={6} label="Quote" value={doc.quote} max={600} min={50} error={errors.quote} onChange={(v) => set("quote", v)} />
          <div className="span-2">
            <ImageSlot slot="voice" label="Photo" value={doc.photo} onChange={(v) => set("photo", v)} error={errors.photo} altError={errors["photo.alt"]} />
          </div>
        </div>
      );
    },
  },

  news: {
    key: "news",
    api: "/api/admin/news",
    route: "/website/news",
    title: "News & events",
    lead: "Cards in the News & events section of the home page.",
    noun: "news item",
    add: "Add news item",
    limit: { min: 1, max: 6 },
    section: { pageKey: "home", key: "news", label: "News & events heading", instagram: true },
    empty: () => ({ tag: "", title: "", line: "", accent: "coral", image: null, eventDate: null, link: "", consent: emptyConsent(), seo: seo() }),
    toBody: (item) => ({
      tag: item.tag || "",
      title: item.title || "",
      line: item.line || "",
      accent: item.accent || "coral",
      image: image(item.image),
      eventDate: item.eventDate || null,
      link: item.link || "",
      consent: toConsent(item.consent),
      seo: seo(item.seo),
    }),
    itemTitle: (item) => item.title || "Untitled",
    itemSub: (item) => item.tag,
    images: (item) => [item.image],
    seoPath: "/",
    schemaType: "Event",
    seoInfo: (doc) => ({ name: doc.title, description: doc.line, image: doc.image?.url, date: doc.eventDate }),
    seoFallback: (doc) => ({ title: doc.title, description: doc.line }),
    Preview: NewsPreview,
    Form({ doc, set, errors }) {
      return (
        <div className="grid-2">
          <TextField label="Tag" hint="e.g. Workshop" value={doc.tag} max={20} min={2} error={errors.tag} onChange={(v) => set("tag", v)} />
          <div className="field">
            <label htmlFor="news-date">Event date</label>
            <input
              id="news-date"
              type="date"
              value={doc.eventDate ? String(doc.eventDate).slice(0, 10) : ""}
              onChange={(e) => set("eventDate", e.target.value || null)}
            />
            <small className="help">Optional.</small>
          </div>
          <TextField wide label="Title" value={doc.title} max={60} min={5} error={errors.title} onChange={(v) => set("title", v)} />
          <TextField wide area rows={2} label="Line" value={doc.line} max={140} min={10} error={errors.line} onChange={(v) => set("line", v)} />
          <TextField wide label="Link" hint="Optional. A site path like /admissions/ or a full https:// link." value={doc.link} max={500} error={errors.link} onChange={(v) => set("link", v)} />
          <AccentPicker label="Colour" value={doc.accent} error={errors.accent} onChange={(v) => set("accent", v)} />
          <div className="span-2">
            <ImageSlot slot="news" label="Photo" value={doc.image} onChange={(v) => set("image", v)} error={errors.image} altError={errors["image.alt"]} />
          </div>
        </div>
      );
    },
  },
};
