/**
 * Blog post editor (BL-2): Content, SEO and Visibility tabs, card preview,
 * save / publish, featured and trending (BR-5, BR-6), and Preview (BL-7).
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { Banner } from "../components.jsx";
import { ImageSlot } from "../content/imageSlot.jsx";
import { BlogCardPreview } from "../content/previews.jsx";
import { SeoFields } from "../content/seoFields.jsx";
import { ConsentField, emptyConsent, Req, StatusChip, TextField, toConsent, useDialogs, useUnsavedGuard } from "../content/ui.jsx";
import BlockEditor from "./BlockEditor.jsx";

const EMPTY = {
  slug: "",
  title: "",
  excerpt: "",
  category: "",
  author: "Little Elly Team",
  publishedAt: null,
  coverImage: null,
  blocks: [],
  seo: { metaTitle: "", metaDescription: "", keywords: [], canonicalUrl: "", robots: "index,follow", ogImage: null, schemaJsonLd: "" },
  consent: emptyConsent(),
};

function toBody(item) {
  return {
    slug: item.slug || "",
    title: item.title || "",
    excerpt: item.excerpt || "",
    category: typeof item.category === "object" && item.category ? item.category.id : item.category || "",
    author: item.author || "",
    publishedAt: item.publishedAt || null,
    coverImage: item.coverImage ? { ...item.coverImage } : null,
    blocks: (item.blocks || []).map((block) => ({ ...block })),
    seo: { ...EMPTY.seo, ...(item.seo || {}) },
    consent: toConsent(item.consent),
  };
}

export function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/, "");
}

const TABS = ["Content", "SEO", "Visibility"];

export default function PostEditor() {
  const params = useParams();
  // Kept in state so saving a new post only updates the address (no reload, no jump to the top).
  const [id, setId] = useState(params.id);
  const isNew = id === "new";
  const navigate = useNavigate();
  const { confirm, toast } = useDialogs();

  const [doc, setDoc] = useState(isNew ? EMPTY : null);
  const [saved, setSaved] = useState(isNew ? JSON.stringify(EMPTY) : "");
  const [meta, setMeta] = useState({ status: "draft", featured: false, trending: false, trendingOrder: null });
  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState("Content");
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [previewNote, setPreviewNote] = useState("");

  const dirty = doc !== null && JSON.stringify(doc) !== saved;
  useUnsavedGuard(dirty && !busy);

  useEffect(() => {
    api("/api/admin/blog-categories").then((data) => setCategories(data.items)).catch(() => {});
    if (isNew) return;
    api(`/api/admin/blog-posts/${id}`)
      .then((data) => {
        const body = toBody(data.item);
        setDoc(body);
        setSaved(JSON.stringify(body));
        setMeta({ status: data.item.status, featured: data.item.featured, trending: data.item.trending, trendingOrder: data.item.trendingOrder });
      })
      .catch((err) => setBanner(err.message));
  }, [id, isNew]);

  if (!doc) return <div className="page">{banner ? <Banner kind="error">{banner}</Banner> : <p className="muted">Loading…</p>}</div>;

  const set = (key, value) =>
    setDoc((current) => {
      const next = { ...current, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  const category = categories.find((row) => row.id === doc.category);
  const savedSlug = saved ? JSON.parse(saved).slug : "";
  const live = meta.status === "published";

  function showErrors(err) {
    const fields = err.fields || {};
    setErrors(fields);
    setBanner(err.message);
    const keys = Object.keys(fields);
    if (keys.length && keys.every((key) => key.startsWith("seo.") || key.startsWith("consent"))) setTab(keys[0].startsWith("seo.") ? "SEO" : "Content");
    else if (keys.length) setTab("Content");
  }

  async function save() {
    setBusy(true);
    setErrors({});
    setBanner("");
    try {
      const data = isNew
        ? await api("/api/admin/blog-posts", { method: "POST", body: doc })
        : await api(`/api/admin/blog-posts/${id}`, { method: "PUT", body: doc });
      const body = toBody(data.item);
      setDoc(body);
      setSaved(JSON.stringify(body));
      setMeta((current) => ({ ...current, status: data.item.status }));
      toast("Saved.");
      if (isNew) {
        setId(data.item.id);
        window.history.replaceState(window.history.state, "", `/blogs/posts/${data.item.id}`);
      }
      return data.item;
    } catch (err) {
      showErrors(err);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status) {
    let postId = id;
    if (dirty || isNew) {
      const item = await save();
      if (!item) return;
      postId = item.id;
    }
    setBusy(true);
    try {
      const data = await api(`/api/admin/blog-posts/${postId}/status`, { method: "PATCH", body: { status } });
      setMeta({ status: data.item.status, featured: data.item.featured, trending: data.item.trending, trendingOrder: data.item.trendingOrder });
      const body = toBody(data.item);
      setDoc(body);
      setSaved(JSON.stringify(body));
      setErrors({});
      setBanner("");
      toast(status === "published" ? "Published. It is on the website now." : "Moved to drafts.");
    } catch (err) {
      showErrors(err);
    } finally {
      setBusy(false);
    }
  }

  async function setFlags(body) {
    setBusy(true);
    try {
      const data = await api(`/api/admin/blog-posts/${id}/flags`, { method: "PATCH", body });
      setMeta((current) => ({ ...current, featured: data.item.featured, trending: data.item.trending, trendingOrder: data.item.trendingOrder }));
      toast("Saved.");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete “${doc.title || "this post"}”?`,
      body: "This cannot be undone. Its photos are removed too.",
      confirmLabel: "Delete",
      danger: true,
      typeToConfirm: savedSlug || undefined,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/blog-posts/${id}?confirm=${encodeURIComponent(savedSlug)}`, { method: "DELETE" });
      setSaved(JSON.stringify(doc));
      toast("Deleted.");
      setTimeout(() => navigate("/blogs/posts"), 0);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function preview(event) {
    // WSA rule: preview shows the last saved post, so unsaved edits must be saved first.
    if (isNew || dirty) {
      event.preventDefault();
      setPreviewNote("Save the draft to preview.");
    }
  }

  const flagsReady = !isNew && live && !dirty;

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <Link to="/blogs/posts" className="back-link">
            ← Blog posts
          </Link>
          <h1>{isNew ? "New post" : doc.title || "Untitled post"}</h1>
        </div>
        <span className="row-actions">
          {meta.featured ? <span className="pill featured">Featured</span> : null}
          {meta.trending ? <span className="pill trending">Trending #{meta.trendingOrder}</span> : null}
          <StatusChip status={meta.status} />
        </span>
      </div>
      <Banner kind="error">{banner}</Banner>
      {live && savedSlug && doc.slug !== savedSlug ? <Banner kind="error">Changing the slug breaks old links to this post.</Banner> : null}

      <div className="tabs" role="tablist" aria-label="Post sections">
        {TABS.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>
            {name}
            {name === "SEO" && Object.keys(errors).some((key) => key.startsWith("seo.")) ? " •" : ""}
          </button>
        ))}
      </div>

      {tab === "Content" ? (
        <div className="editor">
          <div className="editor-form stack">
            <section className="card">
              <div className="grid-2">
                <TextField wide label="Title" value={doc.title} max={110} min={10} error={errors.title} onChange={(v) => set("title", v)} />
                <TextField
                  label="URL slug"
                  hint={`littleelly.com/blogs/${doc.slug || "…"}`}
                  value={doc.slug}
                  max={120}
                  error={errors.slug}
                  onChange={(v) => {
                    setSlugTouched(true);
                    set("slug", v.toLowerCase());
                  }}
                />
                <div className="field">
                  <label htmlFor="post-category">
                    Category
                    <Req />
                  </label>
                  <select id="post-category" value={doc.category} onChange={(e) => set("category", e.target.value)} aria-invalid={errors.category ? "true" : undefined}>
                    <option value="">Choose…</option>
                    {categories.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  {errors.category ? <em className="error-text">{errors.category}</em> : null}
                </div>
                <TextField label="Author" value={doc.author} max={60} min={2} error={errors.author} onChange={(v) => set("author", v)} />
                <div className="field">
                  <label htmlFor="post-date">Published date</label>
                  <input
                    id="post-date"
                    type="date"
                    value={doc.publishedAt ? String(doc.publishedAt).slice(0, 10) : ""}
                    onChange={(e) => set("publishedAt", e.target.value || null)}
                  />
                  <small className="help">Empty uses the day you publish.</small>
                  {errors.publishedAt ? <em className="error-text">{errors.publishedAt}</em> : null}
                </div>
                <TextField wide area rows={3} label="Summary" hint="Shown on the card and in search." value={doc.excerpt} max={200} min={50} error={errors.excerpt} onChange={(v) => set("excerpt", v)} />
              </div>
            </section>
            <section className="card">
              <ImageSlot slot="blogCover" label="Cover photo" value={doc.coverImage} onChange={(v) => set("coverImage", v)} error={errors.coverImage} altError={errors["coverImage.alt"]} />
            </section>
            <section className="card">
              <h2>People & consent</h2>
              <ConsentField value={doc.consent} onChange={(v) => set("consent", v)} error={errors["consent.hasPeople"] || errors.consent} />
            </section>
            <section className="card">
              <h2>Story</h2>
              <BlockEditor blocks={doc.blocks} errors={errors} onChange={(blocks) => set("blocks", blocks)} />
            </section>
          </div>
          <div className="editor-preview">
            <BlogCardPreview doc={doc} category={category} />
          </div>
        </div>
      ) : null}

      {tab === "SEO" ? (
        <section className="card">
          <SeoFields
            value={doc.seo}
            onChange={(v) => set("seo", v)}
            errors={errors}
            path={`/blogs/${doc.slug || "slug"}`}
            fallback={{ title: doc.title, description: doc.excerpt }}
            itemId={isNew ? "" : id}
            info={{ name: doc.title, description: doc.excerpt, image: doc.coverImage?.url, author: doc.author }}
            schemaType="BlogPosting"
          />
        </section>
      ) : null}

      {tab === "Visibility" ? (
        <div className="stack">
          <section className="card">
            <h2>Status</h2>
            <p className="muted">{live ? "This post is live on the website." : "This post is a draft. Only you can see it."}</p>
            <div className="row-actions">
              {live ? (
                <button type="button" className="btn" onClick={() => setStatus("draft")} disabled={busy}>
                  Unpublish
                </button>
              ) : (
                <button type="button" className="btn primary" onClick={() => setStatus("published")} disabled={busy}>
                  Publish
                </button>
              )}
            </div>
          </section>
          <section className="card">
            <h2>Featured and trending</h2>
            {!flagsReady ? <p className="help">{isNew || !live ? "Publish the post first." : "Save your changes first."}</p> : null}
            <div className="stack">
              <label className="switch">
                <input type="checkbox" checked={Boolean(meta.featured)} disabled={!flagsReady || busy} onChange={(e) => setFlags({ featured: e.target.checked })} />
                <span>
                  <b>Featured</b>
                  <small>Shown first on the blogs page with “Read the story”. Only one post at a time.</small>
                </span>
              </label>
              <label className="switch">
                <input type="checkbox" checked={Boolean(meta.trending)} disabled={!flagsReady || busy} onChange={(e) => setFlags({ trending: e.target.checked })} />
                <span>
                  <b>Trending</b>
                  <small>Shown in the Trending blogs list. Up to 6 posts.</small>
                </span>
              </label>
              {meta.trending ? (
                <div className="field narrow">
                  <label htmlFor="trend-order">Trending place</label>
                  <select id="trend-order" value={meta.trendingOrder || 1} disabled={!flagsReady || busy} onChange={(e) => setFlags({ trendingOrder: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <small className="help">Choosing a taken place swaps the two posts.</small>
                </div>
              ) : null}
            </div>
          </section>
          {!isNew ? (
            <section className="card danger-zone">
              <h2>Delete post</h2>
              <p className="muted">Removes the post and its photos. This cannot be undone.</p>
              <div className="row-actions">
                <button type="button" className="btn danger" onClick={remove} disabled={busy}>
                  Delete post
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="savebar">
        <span className="muted" aria-live="polite">
          {previewNote && (dirty || isNew) ? previewNote : dirty ? "Unsaved changes" : live ? "Live on the website" : "Draft · not on the website"}
        </span>
        <span className="row-actions">
          <Link className={isNew || dirty ? "btn dim" : "btn"} to={isNew ? "#" : `/blogs/posts/${id}/preview`} onClick={preview}>
            Preview
          </Link>
          <button type="button" className="btn" onClick={save} disabled={busy || (!dirty && !isNew)}>
            {busy ? "Saving…" : live ? "Save" : "Save draft"}
          </button>
          {live ? null : (
            <button type="button" className="btn primary" onClick={() => setStatus("published")} disabled={busy}>
              Publish
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
