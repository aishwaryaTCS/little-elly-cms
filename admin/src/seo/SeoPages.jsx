/**
 * Page SEO (CONTENT_CMS_SPEC.md §8.1): every public page with its health flags
 * (SEO-5), and an editor per page.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { Banner } from "../components.jsx";
import { SeoFields } from "../content/seoFields.jsx";
import { useDialogs, useUnsavedGuard } from "../content/ui.jsx";

const NAMES = {
  home: "Home",
  about: "About us",
  programs: "Our programs",
  curriculum: "Curriculum",
  admissions: "Admissions",
  franchise: "Franchise",
  careers: "Careers",
  blogs: "Blogs",
  dubai: "Dubai",
  franchiseDeck: "Franchise deck",
  privacy: "Privacy policy",
  terms: "Terms and conditions",
  admissionsCampaign: "Admissions campaign",
  franchiseCampaign: "Franchise campaign",
  thankYou: "Thank you",
};

export function SeoPages() {
  const [items, setItems] = useState(null);
  const [limit, setLimit] = useState(8);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/api/admin/page-seo")
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message));
  }, []);

  const issues = items ? items.reduce((sum, item) => sum + item.seoIssues.length, 0) : 0;
  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <p className="kicker">SEO</p>
          <h1>Pages</h1>
          <p className="muted">How each page appears in Google and when shared. {items ? `${issues} ${issues === 1 ? "note" : "notes"} to look at.` : ""}</p>
        </div>
      </div>
      <Banner kind="error">{error}</Banner>
      <div className="card">
        {!items ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="rows">
            {items.slice(0, limit).map((item) => (
              <li key={item.pageKey} className="row">
                <span className="row-main">
                  <Link className="row-title" to={`/seo/pages/${item.pageKey}`}>
                    {NAMES[item.pageKey]}
                  </Link>
                  <span className="row-sub">
                    {item.path} · {item.seo.metaTitle || "No search title"}
                  </span>
                  <span className="row-tags">
                    <span className={`pill ${item.seo.robots === "noindex,nofollow" ? "draft" : "published"}`}>
                      {item.seo.robots === "noindex,nofollow" ? "Hidden from search" : "In search"}
                    </span>
                    {item.seoIssues.map((issue) => (
                      <span key={issue} className="pill warn">
                        {issue}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="row-actions">
                  <Link className="btn small" to={`/seo/pages/${item.pageKey}`}>
                    Edit
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
        {items && items.length > limit ? (
          <button type="button" className="btn ghost show-more" onClick={() => setLimit(items.length)}>
            Show more ({items.length - limit})
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SeoPageForm() {
  const { pageKey } = useParams();
  const { toast } = useDialogs();
  const [item, setItem] = useState(null);
  const [seo, setSeo] = useState(null);
  const [saved, setSaved] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = seo !== null && JSON.stringify(seo) !== saved;
  useUnsavedGuard(dirty && !busy);

  useEffect(() => {
    api(`/api/admin/page-seo/${pageKey}`)
      .then((data) => {
        setItem(data.item);
        setSeo(data.item.seo);
        setSaved(JSON.stringify(data.item.seo));
      })
      .catch((err) => setError(err.message));
  }, [pageKey]);

  if (!seo) return <div className="page">{error ? <Banner kind="error">{error}</Banner> : <p className="muted">Loading…</p>}</div>;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError("");
    try {
      // Section headings are edited on their own screens; they are sent back unchanged.
      const data = await api(`/api/admin/page-seo/${pageKey}`, { method: "PUT", body: { seo, sections: item.sections || {} } });
      setItem(data.item);
      setSeo(data.item.seo);
      setSaved(JSON.stringify(data.item.seo));
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
          <Link to="/seo/pages" className="back-link">
            ← Pages
          </Link>
          <h1>{NAMES[pageKey] || pageKey}</h1>
          <p className="muted">{item.path}</p>
        </div>
      </div>
      <form className="card stack" onSubmit={save}>
        <Banner kind="error">{error}</Banner>
        <SeoFields
          value={seo}
          onChange={setSeo}
          errors={errors}
          path={item.path}
          itemId={item.id || ""}
          info={{ name: seo.metaTitle, description: seo.metaDescription }}
          schemaType="Organization"
        />
        <div className="row-actions">
          <button className="btn primary" type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
