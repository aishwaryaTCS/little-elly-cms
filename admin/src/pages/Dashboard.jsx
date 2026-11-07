import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Banner, useAuth } from "../components.jsx";
import { formatDate, StatusChip } from "../content/ui.jsx";

const ROUTES = {
  team: "/website/team",
  awards: "/website/awards",
  programs: "/website/programs",
  testimonials: "/website/parent-voices",
  news: "/website/news",
  "blog-posts": "/blogs/posts",
};

export default function Dashboard() {
  const { admin } = useAuth();
  const [stats, setStats] = useState(null);
  const [content, setContent] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/content-stats")
      .then(setContent)
      .catch((err) => setError(err.message));
    api("/api/admin/centres/stats")
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page stack">
      <header className="page-head">
        <div>
          <p className="kicker">Little Elly CMS</p>
          <h1>Hello{admin?.name ? `, ${admin.name}` : ""}.</h1>
        </div>
      </header>
      <Banner kind="error">{error}</Banner>

      <section aria-labelledby="content-title" className="stack">
        <h2 id="content-title" className="section-title">Website content</h2>
        <div className="stats six">
          {(content?.counts || []).map((row) => (
            <Link key={row.key} to={ROUTES[row.key]} className="card stat link">
              <b>{row.published}</b>
              <span>{row.label}</span>
              <small>{row.drafts ? `${row.drafts} draft${row.drafts === 1 ? "" : "s"}` : "No drafts"}</small>
            </Link>
          ))}
        </div>
        <div className="card">
          <h2>Recently changed</h2>
          {content?.recent?.length ? (
            <ul className="rows">
              {content.recent.map((item) => (
                <li key={`${item.type}-${item.id}`} className="row">
                  <span className="row-main">
                    <Link className="row-title" to={`${item.type === "blog-posts" ? "/blogs/posts" : ROUTES[item.type]}/${item.id}`}>
                      {item.title}
                    </Link>
                    <span className="row-sub">
                      {item.typeLabel} · {formatDate(item.updatedAt)}
                    </span>
                  </span>
                  <StatusChip status={item.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Nothing changed yet.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="centres-title" className="stack">
        <h2 id="centres-title" className="section-title">Centres</h2>
        <div className="stats">
          <article className="card stat"><b>{stats?.published ?? "—"}</b><span>Published</span></article>
          <article className="card stat"><b>{stats?.drafts ?? "—"}</b><span>Drafts</span></article>
          <article className="card stat"><b>{stats?.cities ?? "—"}</b><span>Cities</span></article>
          <article className="card stat"><b>{stats?.states ?? "—"}</b><span>States</span></article>
        </div>
        <p className="muted">Cities and states are counted from published centres. The 172+ and 20+ figures on the listing page stay editable on the finder page.</p>
        <div className="card">
          <h2>Recently updated centres</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Centre</th><th>Place</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(stats?.recent || []).map((centre) => (
                  <tr key={centre.id}>
                    <td><Link to={`/centres/${centre.id}`}>{centre.area}</Link></td>
                    <td>{centre.city}, {centre.state}</td>
                    <td><span className={`pill ${centre.status}`}>{centre.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
