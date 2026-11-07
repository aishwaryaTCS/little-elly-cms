import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Banner } from "../components.jsx";

export default function Centres() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    if (state) params.set("state", state);
    if (city) params.set("city", city);
    params.set("page", String(page));
    api(`/api/admin/centres?${params.toString()}`)
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [query, status, state, city, page, reload]);

  function askDelete(centre) {
    setPending(centre);
    setConfirmSlug("");
    setError("");
  }

  async function removeCentre() {
    if (!pending || confirmSlug !== pending.slug) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/centres/${pending.id}`, { method: "DELETE" });
      setPending(null);
      setConfirmSlug("");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <header className="page-head">
        <div>
          <p className="kicker">Directory</p>
          <h1>Centres</h1>
          <p className="muted">Edit and Delete sit under each centre name.</p>
        </div>
        <Link className="btn primary" to="/centres/new">New centre</Link>
      </header>
      <Banner kind="error">{error}</Banner>
      {pending ? (
        <section className="card danger-zone stack">
          <h2>Delete {pending.area}</h2>
          <p>Type <strong>{pending.slug}</strong> to remove this centre.</p>
          <input value={confirmSlug} autoComplete="off" placeholder={pending.slug} onChange={(event) => setConfirmSlug(event.target.value)} />
          <div className="row-actions">
            <button className="btn danger" type="button" disabled={busy || confirmSlug !== pending.slug} onClick={removeCentre}>Delete centre</button>
            <button className="btn" type="button" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </section>
      ) : null}
      <div className="filters">
        <input placeholder="Search name, area, city, address" value={q} autoComplete="off" onChange={(event) => { setQ(event.target.value); setPage(1); }} />
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        <select value={state} onChange={(event) => { setState(event.target.value); setCity(""); setPage(1); }}>
          <option value="">All states</option>
          {(data?.states || []).map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={city} onChange={(event) => { setCity(event.target.value); setPage(1); }}>
          <option value="">All cities</option>
          {(data?.cities || []).map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Area</th><th>City</th><th>State</th><th>Phone</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(data?.centres || []).map((centre) => (
                <tr key={centre.id}>
                  <td>
                    <Link to={`/centres/${centre.id}`}>{centre.area}</Link>
                    <div className="muted">{centre.slug}</div>
                    <div className="row-actions">
                      <Link className="btn small" to={`/centres/${centre.id}`}>Edit</Link>
                      <button className="btn small danger" type="button" onClick={() => askDelete(centre)}>Delete</button>
                    </div>
                  </td>
                  <td>{centre.city}</td>
                  <td>{centre.state}</td>
                  <td>{centre.phone || "—"}</td>
                  <td><span className={`pill ${centre.status}`}>{centre.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.total === 0 ? <p className="muted">No centres match.</p> : null}
        <div className="pager">
          <span className="muted">{data ? `${data.total} centres` : ""}</span>
          <div>
            <button className="btn small" type="button" disabled={!data || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button className="btn small" type="button" disabled={!data || page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}
