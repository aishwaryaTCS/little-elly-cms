/**
 * Blog categories (BL-8, BR-7): add, rename, colour, reorder, delete.
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { Banner } from "../components.jsx";
import { AccentPicker, OrderButtons, TextField, useDialogs } from "../content/ui.jsx";
import { slugify } from "./PostEditor.jsx";

function CategoryForm({ initial, onSaved, onCancel }) {
  const { toast } = useDialogs();
  const [doc, setDoc] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const isNew = !initial.id;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = { slug: doc.slug, name: doc.name, accent: doc.accent };
      if (isNew) await api("/api/admin/blog-categories", { method: "POST", body });
      else await api(`/api/admin/blog-categories/${initial.id}`, { method: "PUT", body });
      toast("Saved.");
      onSaved();
    } catch (err) {
      setErrors({ ...(err.fields || {}), form: err.fields && Object.keys(err.fields).length ? "" : err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="category-form" onSubmit={save}>
      {errors.form ? <Banner kind="error">{errors.form}</Banner> : null}
      <div className="grid-2">
        <TextField
          label="Name"
          value={doc.name}
          max={30}
          min={2}
          error={errors.name}
          onChange={(name) => setDoc((current) => ({ ...current, name, slug: isNew ? slugify(name) : current.slug }))}
        />
        <TextField label="Slug" hint="Used in filter links." value={doc.slug} max={120} error={errors.slug} onChange={(slug) => setDoc((c) => ({ ...c, slug: slug.toLowerCase() }))} />
        <div className="span-2">
          <AccentPicker label="Colour" value={doc.accent} error={errors.accent} onChange={(accent) => setDoc((c) => ({ ...c, accent }))} />
        </div>
      </div>
      <div className="row-actions">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : isNew ? "Add category" : "Save"}
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Categories() {
  const { confirm, toast } = useDialogs();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api("/api/admin/blog-categories")
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  async function move(index, direction) {
    const next = items.slice();
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    try {
      await api("/api/admin/blog-categories/reorder", { method: "POST", body: { ids: next.map((row) => row.id) } });
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function remove(item) {
    if (item.posts) {
      toast("Move its posts to another category first.", "error");
      return;
    }
    const ok = await confirm({ title: `Delete “${item.name}”?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/blog-categories/${item.id}`, { method: "DELETE" });
      toast("Deleted.");
      load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  const done = () => {
    setEditing(null);
    load();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">Blogs</p>
          <h1>Categories</h1>
          <p className="muted">The filter tabs on the blogs page. A tab shows once a live post uses it.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => setEditing({ slug: "", name: "", accent: "coral" })}>
          Add category
        </button>
      </div>
      <Banner kind="error">{error}</Banner>
      <div className="card">
        {editing && !editing.id ? <CategoryForm initial={editing} onSaved={done} onCancel={() => setEditing(null)} /> : null}
        {!items ? (
          <p className="muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="empty">No categories yet.</p>
        ) : (
          <ul className="rows">
            {items.map((item, index) =>
              editing?.id === item.id ? (
                <li key={item.id} className="row editing">
                  <CategoryForm initial={item} onSaved={done} onCancel={() => setEditing(null)} />
                </li>
              ) : (
                <li key={item.id} className="row">
                  <OrderButtons index={index} count={items.length} label={item.name} onMove={move} />
                  <span className="dot big" style={{ background: `var(--${item.accent})` }} aria-hidden="true" />
                  <span className="row-main">
                    <span className="row-title">{item.name}</span>
                    <span className="row-sub">
                      /{item.slug} · {item.posts} {item.posts === 1 ? "post" : "posts"}
                    </span>
                  </span>
                  <span className="row-actions">
                    <button type="button" className="btn small" onClick={() => setEditing(item)}>
                      Edit
                    </button>
                    <button type="button" className="btn small ghost" onClick={() => remove(item)} title={item.posts ? "Move its posts first." : undefined}>
                      Delete
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
