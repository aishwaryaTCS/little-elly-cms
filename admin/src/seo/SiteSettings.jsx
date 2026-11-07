/**
 * Site settings (CONTENT_CMS_SPEC.md §8.2): name, address, default share image,
 * organisation details for search, and Search Console verification.
 */
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Banner } from "../components.jsx";
import { ImageSlot } from "../content/imageSlot.jsx";
import { TextField, useDialogs, useUnsavedGuard } from "../content/ui.jsx";

function toBody(item) {
  return {
    siteName: item.siteName || "",
    siteOrigin: item.siteOrigin || "",
    defaultShareImage: item.defaultShareImage || null,
    organization: {
      legalName: item.organization?.legalName || "",
      logo: item.organization?.logo || null,
      phone: item.organization?.phone || "",
      email: item.organization?.email || "",
      sameAs: item.organization?.sameAs || [],
    },
    googleSiteVerification: item.googleSiteVerification || "",
  };
}

export default function SiteSettings() {
  const { toast } = useDialogs();
  const [doc, setDoc] = useState(null);
  const [saved, setSaved] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = doc !== null && JSON.stringify(doc) !== saved;
  useUnsavedGuard(dirty && !busy);

  useEffect(() => {
    api("/api/admin/site-settings")
      .then((data) => {
        const body = toBody(data.item);
        setDoc(body);
        setSaved(JSON.stringify(body));
      })
      .catch((err) => setError(err.message));
  }, []);

  if (!doc) return <div className="page">{error ? <Banner kind="error">{error}</Banner> : <p className="muted">Loading…</p>}</div>;
  const set = (key, value) => setDoc((current) => ({ ...current, [key]: value }));
  const setOrg = (key, value) => setDoc((current) => ({ ...current, organization: { ...current.organization, [key]: value } }));
  const links = doc.organization.sameAs;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError("");
    try {
      const data = await api("/api/admin/site-settings", { method: "PUT", body: doc });
      const body = toBody(data.item);
      setDoc(body);
      setSaved(JSON.stringify(body));
      toast("Saved.");
    } catch (err) {
      setErrors(err.fields || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">SEO</p>
          <h1>Site settings</h1>
          <p className="muted">Used across every page and in Google’s business details.</p>
        </div>
      </div>
      <form className="stack" onSubmit={save}>
        <Banner kind="error">{error}</Banner>
        <section className="card">
          <h2>Website</h2>
          <div className="grid-2">
            <TextField label="Site name" value={doc.siteName} max={40} min={2} error={errors.siteName} onChange={(v) => set("siteName", v)} />
            <TextField label="Website address" hint="Builds every canonical link." value={doc.siteOrigin} max={200} error={errors.siteOrigin} onChange={(v) => set("siteOrigin", v)} />
            <TextField
              wide
              label="Google Search Console code"
              hint="Optional. Only the code from the verification tag."
              value={doc.googleSiteVerification}
              max={100}
              error={errors.googleSiteVerification}
              onChange={(v) => set("googleSiteVerification", v)}
            />
          </div>
          <ImageSlot
            slot="share"
            label="Default share image"
            optional
            value={doc.defaultShareImage}
            onChange={(v) => set("defaultShareImage", v)}
            error={errors.defaultShareImage}
            altError={errors["defaultShareImage.alt"]}
          />
          <p className="help">Used when a page has no share image of its own.</p>
        </section>
        <section className="card">
          <h2>Organisation</h2>
          <div className="grid-2">
            <TextField label="Name" value={doc.organization.legalName} max={80} min={2} error={errors["organization.legalName"]} onChange={(v) => setOrg("legalName", v)} />
            <TextField label="Phone" value={doc.organization.phone} max={20} error={errors["organization.phone"]} onChange={(v) => setOrg("phone", v)} />
            <TextField wide label="Email" value={doc.organization.email} max={120} error={errors["organization.email"]} onChange={(v) => setOrg("email", v)} />
          </div>
          <ImageSlot
            slot="logo"
            label="Logo"
            optional
            value={doc.organization.logo}
            onChange={(v) => setOrg("logo", v)}
            error={errors["organization.logo"]}
            altError={errors["organization.logo.alt"]}
          />
          <fieldset className="field lines">
            <legend>Social profiles</legend>
            {links.map((link, index) => (
              <div className="inline single" key={index}>
                <TextField
                  label={`Profile ${index + 1}`}
                  value={link}
                  max={300}
                  error={errors[`organization.sameAs.${index}`]}
                  onChange={(v) => setOrg("sameAs", links.map((item, i) => (i === index ? v : item)))}
                />
                <button type="button" className="btn small" onClick={() => setOrg("sameAs", links.filter((_, i) => i !== index))} aria-label={`Remove profile ${index + 1}`}>
                  Remove
                </button>
              </div>
            ))}
            {links.length < 8 ? (
              <button type="button" className="btn ghost" onClick={() => setOrg("sameAs", [...links, "https://"])}>
                Add profile
              </button>
            ) : null}
          </fieldset>
        </section>
        <div className="savebar">
          <span className="muted">{dirty ? "Unsaved changes" : "All saved"}</span>
          <button className="btn primary" type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
