/**
 * List screen for one content type (UI-3): section heading, items in website
 * order with thumbnail, status, reorder, edit, publish and delete.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Banner } from "../components.jsx";
import { TYPES } from "./types.jsx";
import { NeedsPhoto, OrderButtons, smallestUrl, StatusChip, TextField, useDialogs } from "./ui.jsx";

/** Edits the kicker / headline (and lead or Instagram) of the section this list fills (§4.4). */
export function SectionHeading({ section }) {
  const { toast } = useDialogs();
  const [value, setValue] = useState(null);
  const [saved, setSaved] = useState(null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/api/admin/page-seo/${section.pageKey}`)
      .then((data) => {
        const current = data.item.sections?.[section.key] || { kicker: "", headline: ["", ""] };
        setValue(current);
        setSaved(JSON.stringify(current));
      })
      .catch((err) => setError(err.message));
  }, [section.pageKey, section.key]);

  if (!value) return error ? <Banner kind="error">{error}</Banner> : null;
  const set = (key, next) => setValue((current) => ({ ...current, [key]: next }));
  const dirty = JSON.stringify(value) !== saved;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError("");
    try {
      const data = await api(`/api/admin/page-seo/${section.pageKey}/sections/${section.key}`, { method: "PATCH", body: value });
      const next = data.item.sections[section.key];
      setValue(next);
      setSaved(JSON.stringify(next));
      toast("Heading saved.");
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card section-heading" onSubmit={save}>
      <h2>{section.label}</h2>
      <p className="help">The words above this section on the website. The second line is shown in colour.</p>
      <Banner kind="error">{error}</Banner>
      <div className="grid-2">
        <TextField label="Kicker" value={value.kicker} max={30} min={2} error={errors.kicker} onChange={(v) => set("kicker", v)} />
        <TextField label="Headline line 1" value={value.headline?.[0]} max={30} error={errors["headline.0"] || errors.headline} onChange={(v) => set("headline", [v, value.headline?.[1] ?? ""])} />
        <TextField label="Headline line 2" value={value.headline?.[1]} max={30} error={errors["headline.1"]} onChange={(v) => set("headline", [value.headline?.[0] ?? "", v])} />
        {section.lead ? <TextField wide area rows={2} label="Lead" value={value.lead} max={160} min={10} error={errors.lead} onChange={(v) => set("lead", v)} /> : null}
        {section.instagram ? (
          <>
            <TextField label="Instagram handle" value={value.instagramHandle} max={40} error={errors.instagramHandle} onChange={(v) => set("instagramHandle", v)} />
            <TextField label="Instagram link" value={value.instagramUrl} max={300} error={errors.instagramUrl} onChange={(v) => set("instagramUrl", v)} />
          </>
        ) : null}
      </div>
      <div className="row-actions">
        <button className="btn primary" type="submit" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save heading"}
        </button>
      </div>
    </form>
  );
}

function Rows({ type, items, kind, onChanged }) {
  const { confirm, toast } = useDialogs();
  const meta = kind ? type.kinds[kind] : type;
  const [shown, setShown] = useState(6);
  const limit = meta.limit;
  const live = items.filter((item) => item.status === "published").length;
  const newLink = `${type.route}/new${kind ? `?kind=${kind}` : ""}`;

  async function move(index, direction) {
    const next = items.slice();
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    try {
      await api(`${type.api}/reorder`, { method: "POST", body: { ids: next.map((row) => row.id) } });
      onChanged();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function setStatus(item, status, hideSection = false) {
    try {
      await api(`${type.api}/${item.id}/status`, { method: "PATCH", body: { status, ...(hideSection ? { hideSection: true } : {}) } });
      toast(status === "published" ? "Published." : "Moved to drafts.");
      onChanged();
    } catch (err) {
      if (err.status === 409 && !hideSection && /hides the section/.test(err.message)) {
        const ok = await confirm({ title: "Hide this section?", body: `${err.message} Nothing else is live here.`, confirmLabel: "Unpublish", danger: true });
        if (ok) return setStatus(item, status, true);
        return undefined;
      }
      if (err.status === 400 && err.fields) {
        toast(`${err.message} Open it to see what is missing.`, "error");
        return undefined;
      }
      toast(err.message, "error");
    }
    return undefined;
  }

  async function remove(item) {
    const title = type.itemTitle(item);
    const ok = await confirm({
      title: `Delete “${title}”?`,
      body: "This cannot be undone. Its photos are removed too.",
      confirmLabel: "Delete",
      danger: true,
      typeToConfirm: type.slugged && item.slug ? item.slug : undefined,
    });
    if (!ok) return;
    const params = new URLSearchParams();
    if (type.slugged && item.slug) params.set("confirm", item.slug);
    for (;;) {
      try {
        await api(`${type.api}/${item.id}?${params}`, { method: "DELETE" });
        toast("Deleted.");
        onChanged();
        return;
      } catch (err) {
        // BR-4: the server says this is the last live item of the section.
        if (err.status === 409 && !params.has("hideSection") && /hides the section/.test(err.message)) {
          const hide = await confirm({ title: "Hide this section?", body: "This is the last live item, so the section disappears from the website.", confirmLabel: "Delete anyway", danger: true });
          if (!hide) return;
          params.set("hideSection", "true");
          continue;
        }
        toast(err.message, "error");
        return;
      }
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div>
          {kind ? <h2>{meta.label}</h2> : null}
          {limit ? (
            <p className="help">
              {live} of {limit.max} live{limit.min ? ` · at least ${limit.min} needed to show the section` : ""}
            </p>
          ) : null}
        </div>
        <Link className="btn primary" to={newLink}>
          {meta.add || type.add}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <ul className="rows">
          {items.slice(0, shown).map((item, index) => {
            const thumb = smallestUrl(type.images(item).find(Boolean));
            return (
              <li key={item.id} className="row">
                <OrderButtons index={index} count={items.length} label={type.itemTitle(item)} onMove={move} />
                {thumb ? <img className="row-thumb" src={thumb} alt="" loading="lazy" /> : <span className="row-thumb" />}
                <span className="row-main">
                  <Link to={`${type.route}/${item.id}`} className="row-title">
                    {type.itemTitle(item)}
                  </Link>
                  <span className="row-sub">{type.itemSub(item)}</span>
                  <span className="row-tags">
                    <StatusChip status={item.status} />
                    <NeedsPhoto images={type.images(item)} />
                  </span>
                </span>
                <span className="row-actions">
                  <Link className="btn small" to={`${type.route}/${item.id}`}>
                    Edit
                  </Link>
                  {item.status === "published" ? (
                    <button type="button" className="btn small" onClick={() => setStatus(item, "draft")}>
                      Unpublish
                    </button>
                  ) : (
                    <button type="button" className="btn small" onClick={() => setStatus(item, "published")}>
                      Publish
                    </button>
                  )}
                  <button type="button" className="btn small ghost" onClick={() => remove(item)}>
                    Delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > shown ? (
        <button type="button" className="btn ghost show-more" onClick={() => setShown((n) => n + 6)}>
          Show more ({items.length - shown})
        </button>
      ) : null}
    </section>
  );
}

export default function ListPage({ typeKey }) {
  const type = TYPES[typeKey];
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(type.api)
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }, [type.api]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">Website</p>
          <h1>{type.title}</h1>
          <p className="muted">{type.lead}</p>
        </div>
      </div>
      <div className="stack">
        <Banner kind="error">{error}</Banner>
        <SectionHeading section={type.section} />
        {!items ? (
          <p className="muted">Loading…</p>
        ) : type.kinds ? (
          Object.keys(type.kinds).map((kind) => (
            <Rows key={kind} type={type} kind={kind} items={items.filter((item) => item.kind === kind)} onChanged={load} />
          ))
        ) : (
          <Rows type={type} items={items} onChanged={load} />
        )}
      </div>
    </div>
  );
}
