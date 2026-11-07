/**
 * Edit screen for one item of an ordered content type: form, live preview,
 * save / publish bar, unsaved-change guard (UI-4, UI-5).
 */
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { Banner } from "../components.jsx";
import { TYPES } from "./types.jsx";
import { SeoFields } from "./seoFields.jsx";
import { ConsentField, Panels, StatusChip, useDialogs, useUnsavedGuard } from "./ui.jsx";

export default function ItemPage({ typeKey }) {
  const type = TYPES[typeKey];
  const params = useParams();
  // Kept in state so saving a new item only updates the address (no reload, no jump to the top).
  const [id, setId] = useState(params.id);
  const [query] = useSearchParams();
  const { confirm, toast } = useDialogs();
  const isNew = id === "new";

  const [doc, setDoc] = useState(isNew ? type.empty(query.get("kind") || undefined) : null);
  const [saved, setSaved] = useState(isNew ? JSON.stringify(type.empty(query.get("kind") || undefined)) : "");
  const [status, setStatus] = useState("draft");
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState({ kind: "", text: "" });
  const [busy, setBusy] = useState(false);

  const dirty = doc !== null && JSON.stringify(doc) !== saved;
  useUnsavedGuard(dirty && !busy);

  useEffect(() => {
    if (isNew) return;
    api(`${type.api}/${id}`)
      .then((data) => {
        const body = type.toBody(data.item);
        setDoc(body);
        setSaved(JSON.stringify(body));
        setStatus(data.item.status);
      })
      .catch((err) => setBanner({ kind: "error", text: err.message }));
  }, [id, isNew, type]);

  if (!doc) {
    return (
      <div className="page">
        <Banner kind="error">{banner.text}</Banner>
        {!banner.text ? <p className="muted">Loading…</p> : null}
      </div>
    );
  }

  const set = (key, value) => setDoc((current) => ({ ...current, [key]: value }));
  const savedDoc = saved ? JSON.parse(saved) : {};
  const slugChanged = type.slugged && status === "published" && savedDoc.slug && doc.slug !== savedDoc.slug;
  const noun = type.kinds ? type.kinds[doc.kind]?.noun : type.noun;

  async function save() {
    setBusy(true);
    setErrors({});
    setBanner({ kind: "", text: "" });
    try {
      const data = isNew
        ? await api(type.api, { method: "POST", body: doc })
        : await api(`${type.api}/${id}`, { method: "PUT", body: doc });
      const body = type.toBody(data.item);
      setDoc(body);
      setSaved(JSON.stringify(body));
      setStatus(data.item.status);
      toast("Saved.");
      if (isNew) {
        setId(data.item.id);
        window.history.replaceState(window.history.state, "", `${type.route}/${data.item.id}`);
      }
      return data.item;
    } catch (err) {
      setErrors(err.fields || {});
      setBanner({ kind: "error", text: err.message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next, hideSection = false) {
    let itemId = id;
    if (dirty || isNew) {
      const item = await save();
      if (!item) return;
      itemId = item.id;
    }
    setBusy(true);
    setErrors({});
    try {
      const data = await api(`${type.api}/${itemId}/status`, {
        method: "PATCH",
        body: { status: next, ...(hideSection ? { hideSection: true } : {}) },
      });
      setStatus(data.item.status);
      setBanner({ kind: "", text: "" });
      toast(next === "published" ? "Published. It is on the website now." : "Moved to drafts.");
    } catch (err) {
      if (err.status === 409 && !hideSection && /hides the section/.test(err.message)) {
        setBusy(false);
        const ok = await confirm({ title: "Hide this section?", body: "This is the last live item, so the section disappears from the website.", confirmLabel: "Unpublish", danger: true });
        if (ok) await changeStatus(next, true);
        return;
      }
      setErrors(err.fields || {});
      setBanner({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const Form = type.Form;
  const Preview = type.Preview;

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <Link to={type.route} className="back-link">
            ← {type.title}
          </Link>
          <h1>{isNew ? `New ${noun}` : type.itemTitle(doc)}</h1>
        </div>
        <StatusChip status={status} />
      </div>
      <Banner kind={banner.kind || "info"}>{banner.text}</Banner>
      {slugChanged ? <Banner kind="error">Changing the slug breaks old links to this page.</Banner> : null}
      <div className="editor">
        <div className="editor-form">
          <Form doc={doc} set={set} errors={errors} />
          <Panels
            key={Object.keys(errors).join()}
            initial={errors.consent || errors["consent.hasPeople"] ? 0 : Object.keys(errors).some((k) => k.startsWith("seo.")) ? 1 : -1}
            items={[
              {
                title: "People & consent",
                badge: doc.consent?.hasPeople && !(doc.consent.photoAllowed && doc.consent.nameAllowed) ? "Approval needed" : "",
                content: <ConsentField value={doc.consent} onChange={(v) => set("consent", v)} error={errors["consent.hasPeople"] || errors.consent} />,
              },
              {
                title: "Search (SEO)",
                content: (
                  <SeoFields
                    value={doc.seo}
                    onChange={(v) => set("seo", v)}
                    errors={errors}
                    fallback={type.seoFallback ? type.seoFallback(doc) : undefined}
                    path={typeof type.seoPath === "function" ? type.seoPath(doc) : type.seoPath}
                    itemId={isNew ? "" : id}
                    info={type.seoInfo?.(doc)}
                    schemaType={type.schemaType}
                  />
                ),
              },
            ]}
          />
        </div>
        <div className="editor-preview">
          <Preview doc={doc} />
        </div>
      </div>
      <div className="savebar">
        <span className="muted">{dirty ? "Unsaved changes" : status === "published" ? "Live on the website" : "Draft · not on the website"}</span>
        <span className="row-actions">
          <button type="button" className="btn" onClick={save} disabled={busy || (!dirty && !isNew)}>
            {busy ? "Saving…" : status === "published" ? "Save" : "Save draft"}
          </button>
          {status === "published" ? (
            <button type="button" className="btn" onClick={() => changeStatus("draft")} disabled={busy}>
              Unpublish
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => changeStatus("published")} disabled={busy}>
              Publish
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
