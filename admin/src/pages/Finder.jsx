import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Banner, Fields, PairList } from "../components.jsx";

const tabs = [
  ["seo", "SEO"],
  ["hero", "Listing hero"],
  ["search", "Search"],
  ["messages", "Messages"],
  ["places", "Search & map"],
];

const fields = {
  seo: [
    { path: "seo.title", label: "Meta title", type: "area", wide: true, hint: "Used on /centers/ only." },
    { path: "seo.description", label: "Meta description", type: "area", wide: true, hint: "Used on /centers/ only." },
  ],
  hero: [
    { path: "hero.kicker", label: "Kicker" },
    { path: "hero.headline1", label: "Headline line 1" },
    { path: "hero.headline2", label: "Headline line 2", hint: "Shown in the accent colour." },
    { path: "hero.lead", label: "Lead", type: "area", wide: true },
    { path: "hero.stat1Value", label: "Stat 1 value", hint: "Editable override, such as 172+." },
    { path: "hero.stat1Label", label: "Stat 1 label" },
    { path: "hero.stat2Label", label: "Stat 2 label", hint: "The number is the count of published cities." },
    { path: "hero.stat3Label", label: "Stat 3 label", hint: "The number is the count of published states." },
    { path: "hero.stat4Value", label: "Stat 4 value" },
    { path: "hero.stat4Label", label: "Stat 4 label" },
  ],
  search: [
    { path: "search.kicker", label: "Kicker", hint: "Home only." },
    { path: "search.headline", label: "Headline", hint: "Home only." },
    { path: "search.headlineAccent", label: "Headline accent", hint: "Home only. The second line." },
    { path: "search.lead", label: "Lead", type: "area", wide: true, hint: "Home only." },
    { path: "search.placeholder", label: "Search placeholder" },
    { path: "search.nearMe", label: "Near me button" },
    { path: "search.allStates", label: "All-states pill" },
    { path: "search.resultsLine", label: "Results line", wide: true, hint: "Tokens: {shown}, {total}, {scope}." },
    { path: "search.emptyState", label: "Empty state", type: "area", wide: true },
    { path: "search.showMore", label: "Show more", hint: "Listing page only." },
    { path: "search.seeAllLabel", label: "See all link", hint: "Home only." },
    { path: "search.seeAllHref", label: "See all path" },
    { path: "search.disclaimer", label: "Disclaimer", type: "area", wide: true },
    { path: "search.homeResultsCap", label: "Home results cap", type: "number" },
    { path: "search.listingPageSize", label: "Listing page size", type: "number", hint: "Shown first, then the same number again on each Show more." },
  ],
  messages: [
    { path: "location.unavailable", label: "Browser has no location", wide: true },
    { path: "location.searching", label: "Searching" },
    { path: "location.success", label: "Success" },
    { path: "location.denied", label: "Denied or failed", wide: true },
    { path: "card.view", label: "View button" },
    { path: "card.call", label: "Call button" },
    { path: "card.directions", label: "Directions button" },
    { path: "card.headPrefix", label: "Centre head prefix" },
    { path: "card.popupKicker", label: "Popup kicker" },
    { path: "card.popupButton", label: "Popup button" },
    { path: "card.closeLabel", label: "Close label" },
  ],
};

export default function Finder() {
  const [doc, setDoc] = useState(null);
  const [tab, setTab] = useState("seo");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/admin/finder")
      .then((data) => setDoc(data.finder))
      .catch((err) => setError(err.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setErrors({});
    const { updatedAt, ...payload } = doc;
    try {
      const data = await api("/api/admin/finder", { method: "PUT", body: payload });
      setDoc(data.finder);
      setMessage("Finder page saved.");
    } catch (err) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return <div className="page">{error ? <Banner kind="error">{error}</Banner> : <p className="muted">Loading finder page…</p>}</div>;
  }

  return (
    <form className="page stack" onSubmit={save}>
      <header className="page-head">
        <div>
          <p className="kicker">One record</p>
          <h1>Finder page</h1>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save finder"}</button>
      </header>
      <p className="muted">This copy is used on the home section and on /centers/. City and state counts are calculated from published centres.</p>
      <Banner kind="error">{error}</Banner>
      <Banner kind="ok">{message}</Banner>
      <div className="tabs">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {fields[tab] ? (
        <section className="card">
          <Fields doc={doc} setDoc={setDoc} errors={errors} rows={fields[tab]} />
        </section>
      ) : (
        <section className="card stack">
          <h2>Search aliases</h2>
          <p className="muted">A typed word and the city name it should match. Example: bengaluru → bangalore.</p>
          <PairList
            items={doc.aliases}
            onChange={(aliases) => setDoc((current) => ({ ...current, aliases }))}
            left="from"
            right="to"
            leftLabel="Typed word"
            rightLabel="City name"
            addLabel="Add an alias"
            error={errors.aliases}
          />
          <h2>City coordinates</h2>
          <p className="muted">Used only to sort Near me. A city with no row sorts last.</p>
          <div className="list">
            {doc.cities.map((city, index) => (
              <div className="inline three" key={index}>
                <input value={city.name} autoComplete="off" placeholder="City" onChange={(event) => setDoc((current) => ({ ...current, cities: current.cities.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} />
                <input value={city.lat} autoComplete="off" placeholder="Lat" onChange={(event) => setDoc((current) => ({ ...current, cities: current.cities.map((item, itemIndex) => itemIndex === index ? { ...item, lat: event.target.value === "" ? "" : Number(event.target.value) } : item) }))} />
                <input value={city.lng} autoComplete="off" placeholder="Lng" onChange={(event) => setDoc((current) => ({ ...current, cities: current.cities.map((item, itemIndex) => itemIndex === index ? { ...item, lng: event.target.value === "" ? "" : Number(event.target.value) } : item) }))} />
                <button className="btn small" type="button" onClick={() => setDoc((current) => ({ ...current, cities: current.cities.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button>
              </div>
            ))}
            {errors.cities ? <em className="error-text">{errors.cities}</em> : null}
            <button className="btn ghost" type="button" onClick={() => setDoc((current) => ({ ...current, cities: [...current.cities, { name: "", lat: "", lng: "" }] }))}>Add a city</button>
          </div>
        </section>
      )}
    </form>
  );
}
