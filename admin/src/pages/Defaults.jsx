import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Banner, Fields, ImageField, moveItem, PairList, StringList } from "../components.jsx";

const copyFields = [
  { path: "page.seoTitle", label: "SEO title", wide: true, hint: "Tokens: {area}, {city}." },
  { path: "page.seoDescription", label: "SEO description", type: "area", wide: true },
  { path: "page.breadcrumbRoot", label: "Breadcrumb root" },
  { path: "page.intro", label: "Intro", type: "area", wide: true },
  { path: "page.bookVisit", label: "Book a visit" },
  { path: "page.bookVisitHref", label: "Book a visit path" },
  { path: "page.headKicker", label: "Head section kicker" },
  { path: "page.sinceLine", label: "Since line", hint: "Token: {year}." },
  { path: "page.callCentre", label: "Call the centre" },
  { path: "page.notesHeading", label: "Notes heading", hint: "Token: {headFirstName}." },
  { path: "page.mascotLine", label: "Mascot line", wide: true },
  { path: "page.strengthsKicker", label: "Strengths kicker" },
  { path: "page.dayHeading", label: "Day heading", hint: "Token: {area}." },
  { path: "page.programsKicker", label: "Programs kicker" },
  { path: "page.facilitiesKicker", label: "Facilities kicker" },
  { path: "page.timingsKicker", label: "Timings kicker" },
  { path: "page.addressKicker", label: "Address kicker" },
  { path: "page.directionsButton", label: "Directions button" },
  { path: "page.enquireHeading", label: "Enquire heading", wide: true },
  { path: "page.enquireWithHead", label: "Enquire line, with head", type: "area", wide: true },
  { path: "page.enquireNoHead", label: "Enquire line, no head", type: "area", wide: true },
  { path: "page.emailButton", label: "Email button" },
  { path: "page.admissionsButton", label: "Admissions button" },
  { path: "page.admissionsHref", label: "Admissions path" },
  { path: "page.emailPopupKicker", label: "Email popup kicker" },
  { path: "page.emailPopupButton", label: "Email popup button" },
  { path: "page.nearbyKicker", label: "Nearby kicker" },
  { path: "page.nearbyCardLink", label: "Nearby card link" },
  { path: "page.seeAllLabel", label: "See all" },
  { path: "page.seeAllHref", label: "See all path" },
  { path: "page.nearbyCount", label: "Nearby count", type: "number", hint: "Same city first, then the same state." },
];

export default function Defaults() {
  const [doc, setDoc] = useState(null);
  const [tab, setTab] = useState("copy");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/admin/defaults")
      .then((data) => setDoc(data.defaults))
      .catch((err) => setError(err.message));
  }, []);

  function patch(key, value) {
    setDoc((current) => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setErrors({});
    const { updatedAt, ...payload } = doc;
    try {
      const data = await api("/api/admin/defaults", { method: "PUT", body: payload });
      setDoc(data.defaults);
      setMessage("Shared defaults saved.");
    } catch (err) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return <div className="page">{error ? <Banner kind="error">{error}</Banner> : <p className="muted">Loading shared defaults…</p>}</div>;
  }

  return (
    <form className="page stack" onSubmit={save}>
      <header className="page-head">
        <div>
          <p className="kicker">One record</p>
          <h1>Shared defaults</h1>
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save defaults"}</button>
      </header>
      <p className="muted">Used when a centre’s “use network defaults” is on, or when one of its lists is empty. The sentences below are the same on every centre page. Tokens: {"{area}"}, {"{city}"}, {"{state}"}, {"{headFirstName}"}, {"{year}"}.</p>
      <Banner kind="error">{error}</Banner>
      <Banner kind="ok">{message}</Banner>
      <div className="tabs">
        {[
          ["copy", "Page copy"],
          ["lists", "Lists"],
          ["day", "A day"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "copy" ? (
        <section className="card"><Fields doc={doc} setDoc={setDoc} errors={errors} rows={copyFields} /></section>
      ) : null}

      {tab === "lists" ? (
        <section className="card stack">
          <h2>Strengths</h2>
          <p className="muted">A centre page shows the first three, in this order.</p>
          <PairList items={doc.strengths} onChange={(strengths) => patch("strengths", strengths)} left="label" right="line" leftLabel="Label" rightLabel="Line" addLabel="Add a strength" error={errors.strengths} />
          <h2>Facilities</h2>
          <p className="muted">A centre page shows the first six, in this order.</p>
          <StringList items={doc.facilities} onChange={(facilities) => patch("facilities", facilities)} addLabel="Add a facility" placeholder="Facility" error={errors.facilities} />
          <h2>Programs</h2>
          <StringList items={doc.programs} onChange={(programs) => patch("programs", programs)} addLabel="Add a program" placeholder="Program" error={errors.programs} />
          <h2>Timings</h2>
          <PairList items={doc.hours} onChange={(hours) => patch("hours", hours)} left="label" right="value" leftLabel="Label" rightLabel="Hours" addLabel="Add a timing" error={errors.hours} />
        </section>
      ) : null}

      {tab === "day" ? (
        <section className="card stack">
          <h2>A day</h2>
          <p className="muted">One schedule for every centre. Each step can have its own photo. Until a photo is added, the public site can keep its shared classroom photo.</p>
          {doc.day.map((step, index) => (
            <div className="card stack" key={index}>
              <div className="grid-2">
                <label className="field">Time
                  <input value={step.time} autoComplete="off" onChange={(event) => patch("day", doc.day.map((item, itemIndex) => itemIndex === index ? { ...item, time: event.target.value } : item))} />
                  {errors[`day.${index}.time`] ? <em>{errors[`day.${index}.time`]}</em> : null}
                </label>
                <label className="field">Title
                  <input value={step.title} autoComplete="off" onChange={(event) => patch("day", doc.day.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} />
                </label>
              </div>
              <ImageField image={step.photo} onChange={(photo) => patch("day", doc.day.map((item, itemIndex) => itemIndex === index ? { ...item, photo } : item))} />
              <div>
                <button className="btn small" type="button" disabled={index === 0} onClick={() => patch("day", moveItem(doc.day, index, -1))}>Up</button>
                <button className="btn small" type="button" disabled={index === doc.day.length - 1} onClick={() => patch("day", moveItem(doc.day, index, 1))}>Down</button>
                <button className="btn small" type="button" onClick={() => patch("day", doc.day.filter((_, itemIndex) => itemIndex !== index))}>Remove step</button>
              </div>
            </div>
          ))}
          {errors.day ? <em className="error-text">{errors.day}</em> : null}
          <button className="btn ghost" type="button" onClick={() => patch("day", [...doc.day, { time: "", title: "", photo: null }])}>Add a step</button>
        </section>
      ) : null}
    </form>
  );
}
