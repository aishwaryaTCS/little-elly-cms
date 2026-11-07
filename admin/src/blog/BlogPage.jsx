/**
 * Blogs page settings (BL-9): hero copy and how many posts load per "Show more".
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Banner } from "../components.jsx";
import { TextField, useDialogs, useUnsavedGuard } from "../content/ui.jsx";

export default function BlogPage() {
  const { toast } = useDialogs();
  const [hero, setHero] = useState(null);
  const [saved, setSaved] = useState("");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = hero !== null && JSON.stringify(hero) !== saved;
  useUnsavedGuard(dirty && !busy);

  useEffect(() => {
    api("/api/admin/page-seo/blogs")
      .then((data) => {
        const value = data.item.sections?.hero || { kicker: "", headline: ["", ""], lead: "", pageSize: 9 };
        setHero(value);
        setSaved(JSON.stringify(value));
      })
      .catch((err) => setError(err.message));
  }, []);

  if (!hero) return <div className="page">{error ? <Banner kind="error">{error}</Banner> : <p className="muted">Loading…</p>}</div>;
  const set = (key, value) => setHero((current) => ({ ...current, [key]: value }));

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError("");
    try {
      const data = await api("/api/admin/page-seo/blogs/sections/hero", { method: "PATCH", body: hero });
      const next = data.item.sections.hero;
      setHero(next);
      setSaved(JSON.stringify(next));
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
          <p className="kicker">Blogs</p>
          <h1>Blog page</h1>
          <p className="muted">
            The top of littleelly.com/blogs/. Search title and description are under <Link to="/seo/pages/blogs">SEO › Pages</Link>.
          </p>
        </div>
      </div>
      <form className="card stack" onSubmit={save}>
        <Banner kind="error">{error}</Banner>
        <div className="grid-2">
          <TextField label="Kicker" value={hero.kicker} max={30} min={2} error={errors.kicker} onChange={(v) => set("kicker", v)} />
          <TextField label="Headline line 1" value={hero.headline?.[0]} max={30} error={errors["headline.0"] || errors.headline} onChange={(v) => set("headline", [v, hero.headline?.[1] ?? ""])} />
          <TextField label="Headline line 2" hint="Shown in colour." value={hero.headline?.[1]} max={30} error={errors["headline.1"]} onChange={(v) => set("headline", [hero.headline?.[0] ?? "", v])} />
          <TextField wide area rows={3} label="Lead" value={hero.lead} max={220} min={10} error={errors.lead} onChange={(v) => set("lead", v)} />
          <div className="field">
            <label htmlFor="page-size">Posts per load</label>
            <select id="page-size" value={hero.pageSize} onChange={(e) => set("pageSize", Number(e.target.value))}>
              {[3, 6, 9, 12, 15, 18, 21, 24].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <small className="help">Shown first, and added each time a visitor taps “Show more stories”. Multiples of 3 fill the grid.</small>
          </div>
        </div>
        <div className="row-actions">
          <button className="btn primary" type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
