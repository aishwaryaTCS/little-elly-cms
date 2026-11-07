import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { Banner, Field, ImageField, PairList, StringList } from "../components.jsx";

const blank = {
  slug: "",
  name: "",
  area: "",
  city: "",
  state: "",
  address: "",
  phone: "",
  email: "",
  mapUrl: "",
  status: "draft",
  sortOrder: 0,
  head: "",
  headRole: "",
  headSince: "",
  headQuote: "",
  headNotes: [],
  heroImage: null,
  heroImageAlt: "",
  strengths: [],
  programs: [],
  facilities: [],
  hours: [],
  useNetworkDefaults: true,
};

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function CentreForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(id ? null : blank);
  const [slugEdited, setSlugEdited] = useState(Boolean(id));
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState("");

  useEffect(() => {
    if (!id) return;
    api(`/api/admin/centres/${id}`)
      .then((data) => setForm(data.centre))
      .catch((err) => setError(err.message));
  }, [id]);

  function update(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "area" && !id && !slugEdited) next.slug = slugify(value);
      return next;
    });
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setErrors({});
    const { id: centreId, updatedAt, ...payload } = form;
    try {
      const data = await api(centreId ? `/api/admin/centres/${centreId}` : "/api/admin/centres", {
        method: centreId ? "PUT" : "POST",
        body: payload,
      });
      setForm(data.centre);
      setMessage("Saved.");
      if (!centreId) navigate(`/centres/${data.centre.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/centres/${id}`, { method: "DELETE" });
      navigate("/centres");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <div className="page stack">
        <Banner kind="error">{error}</Banner>
        {!error ? <p className="muted">Loading centre…</p> : <Link to="/centres">Back to centres</Link>}
      </div>
    );
  }

  return (
    <form className="page stack" onSubmit={save}>
      <header className="page-head">
        <div>
          <p className="kicker">{id ? "Edit centre" : "New centre"}</p>
          <h1>{form.area || "Untitled centre"}</h1>
          <p className="muted">Public address /{form.slug || "slug"}/</p>
        </div>
        <div className="row-actions">
          <Link className="btn" to="/centres">All centres</Link>
          {id ? <a className="btn danger" href="#delete-centre">Delete centre</a> : null}
        </div>
      </header>
      <Banner kind="error">{error}</Banner>
      <Banner kind="ok">{message}</Banner>

      <section className="card stack">
        <h2>Directory</h2>
        <div className="grid-2">
          <Field label="Full name" error={errors.name}><input value={form.name} autoComplete="off" onChange={(event) => update("name", event.target.value)} /></Field>
          <Field label="Area" hint="Card title and page headline." error={errors.area}><input value={form.area} autoComplete="off" onChange={(event) => update("area", event.target.value)} /></Field>
          <Field label="Slug" hint="Lowercase, unique. Example: hsr-layout-2" error={errors.slug}>
            <input value={form.slug} autoComplete="off" onChange={(event) => { setSlugEdited(true); update("slug", event.target.value); }} />
          </Field>
          <Field label="Sort order" hint="Optional order inside a city. Lower numbers come first." error={errors.sortOrder}>
            <input type="number" value={form.sortOrder} onChange={(event) => update("sortOrder", event.target.value === "" ? "" : Number(event.target.value))} />
          </Field>
          <Field label="City" error={errors.city}><input value={form.city} autoComplete="off" onChange={(event) => update("city", event.target.value)} /></Field>
          <Field label="State" error={errors.state}><input value={form.state} autoComplete="off" onChange={(event) => update("state", event.target.value)} /></Field>
          <Field className="span-2" label="Address" error={errors.address}><textarea rows={3} value={form.address} onChange={(event) => update("address", event.target.value)} /></Field>
        </div>
      </section>

      <section className="card stack">
        <h2>Contact</h2>
        <div className="grid-2">
          <Field label="Phone" hint="Leave empty to hide Call." error={errors.phone}><input value={form.phone} autoComplete="off" onChange={(event) => update("phone", event.target.value)} /></Field>
          <Field label="Email" hint="Leave empty to hide the mail button." error={errors.email}><input value={form.email} autoComplete="off" onChange={(event) => update("email", event.target.value)} /></Field>
          <Field className="span-2" label="Directions link" hint="Leave empty and the website searches Google for the name and address." error={errors.mapUrl}>
            <input value={form.mapUrl} autoComplete="off" placeholder="https://" onChange={(event) => update("mapUrl", event.target.value)} />
          </Field>
          <Field label="Status" error={errors.status}>
            <select value={form.status} onChange={(event) => update("status", event.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>
        </div>
        {form.status === "draft" ? <p className="muted">Draft centres stay out of the finder and have no public page.</p> : null}
      </section>

      <section className="card stack">
        <h2>Centre head</h2>
        <p className="muted">Leave the name empty to hide the whole head block. Do not type a placeholder name.</p>
        <div className="grid-2">
          <Field label="Name" error={errors.head}><input value={form.head} autoComplete="off" onChange={(event) => update("head", event.target.value)} /></Field>
          <Field label="Role" hint="Shown as Centre Head when a name is set and this is empty." error={errors.headRole}><input value={form.headRole} autoComplete="off" onChange={(event) => update("headRole", event.target.value)} /></Field>
          <Field label="With Little Elly since" error={errors.headSince}><input value={form.headSince} autoComplete="off" placeholder="2013" onChange={(event) => update("headSince", event.target.value)} /></Field>
          <Field className="span-2" label="Quote" error={errors.headQuote}><textarea rows={3} value={form.headQuote} onChange={(event) => update("headQuote", event.target.value)} /></Field>
        </div>
        <Field label="Notes" hint="Usually three. Empty notes show as an em dash when a head name is set.">
          <StringList items={form.headNotes} onChange={(headNotes) => update("headNotes", headNotes)} addLabel="Add a note" placeholder="A note from the centre head" error={errors.headNotes} />
        </Field>
      </section>

      <section className="card stack">
        <h2>Hero photo</h2>
        <ImageField image={form.heroImage} onChange={(heroImage) => update("heroImage", heroImage)} />
        <Field label="Photo description" hint={`Leave blank to use “Children at Little Elly ${form.area || "{area}"}”.`} error={errors.heroImageAlt}>
          <input value={form.heroImageAlt} autoComplete="off" onChange={(event) => update("heroImageAlt", event.target.value)} />
        </Field>
        {errors.heroImage ? <em className="error-text">{errors.heroImage}</em> : null}
      </section>

      <section className={`card stack ${form.useNetworkDefaults ? "dimmed" : ""}`}>
        <h2>This centre’s own lists</h2>
        <label className="check">
          <input type="checkbox" checked={form.useNetworkDefaults} onChange={(event) => update("useNetworkDefaults", event.target.checked)} />
          <span>Use network defaults. Strengths, programs, facilities, and timings come from the shared record while this is on. An empty list still uses those defaults after it is turned off.</span>
        </label>
        <Field label="Strengths" hint="The page shows the first three." error={errors.strengths}>
          <PairList items={form.strengths} onChange={(strengths) => update("strengths", strengths)} left="label" right="line" leftLabel="Label" rightLabel="Line" addLabel="Add a strength" />
        </Field>
        <Field label="Programs" error={errors.programs}>
          <StringList items={form.programs} onChange={(programs) => update("programs", programs)} addLabel="Add a program" placeholder="Toddler" />
        </Field>
        <Field label="Facilities" hint="The page shows the first six." error={errors.facilities}>
          <StringList items={form.facilities} onChange={(facilities) => update("facilities", facilities)} addLabel="Add a facility" placeholder="Outdoor play area" />
        </Field>
        <Field label="Timings" error={errors.hours}>
          <PairList items={form.hours} onChange={(hours) => update("hours", hours)} left="label" right="value" leftLabel="Label" rightLabel="Hours" addLabel="Add a timing" />
        </Field>
      </section>

      <div className="savebar">
        <span className="muted">{form.status === "published" ? "Published centres appear in the finder." : "This centre is a draft."}</span>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save centre"}</button>
      </div>

      {id ? (
        <section id="delete-centre" className="card danger-zone stack">
          <h2>Delete this centre</h2>
          <p>This removes the directory row and its page content. Type <strong>{form.slug}</strong> to confirm.</p>
          <input value={confirmSlug} autoComplete="off" onChange={(event) => setConfirmSlug(event.target.value)} />
          <button className="btn danger" type="button" disabled={busy || confirmSlug !== form.slug} onClick={remove}>Delete centre</button>
        </section>
      ) : null}
    </form>
  );
}
