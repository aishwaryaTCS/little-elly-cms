/**
 * Blog posts list (BL-1): search, filters, 20 per page, flags, SEO issues.
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { Banner } from "../components.jsx";
import { formatDate, NeedsPhoto, smallestUrl, StatusChip, useDialogs } from "../content/ui.jsx";

export default function Posts() {
  const { confirm, toast } = useDialogs();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const filter = (key) => params.get(key) || "";
  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    api("/api/admin/blog-categories").then((res) => setCategories(res.items)).catch(() => {});
  }, []);

  // Search waits for a short pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get("q") || "") !== q.trim()) update("q", q.trim());
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const query = new URLSearchParams();
    for (const key of ["q", "status", "category", "page"]) if (params.get(key)) query.set(key, params.get(key));
    if (params.get("flag") === "featured") query.set("featured", "true");
    if (params.get("flag") === "trending") query.set("trending", "true");
    api(`/api/admin/blog-posts?${query}`)
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [params, reload]);

  async function remove(post) {
    const ok = await confirm({
      title: `Delete “${post.title}”?`,
      body: "This cannot be undone. Its photos are removed too.",
      confirmLabel: "Delete",
      danger: true,
      typeToConfirm: post.slug || undefined,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/blog-posts/${post.id}?confirm=${encodeURIComponent(post.slug || "")}`, { method: "DELETE" });
      toast("Deleted.");
      setReload((n) => n + 1);
    } catch (err) {
      toast(err.message, "error");
    }
  }

  const page = Number(filter("page") || 1);

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <p className="kicker">Blogs</p>
          <h1>Blog posts</h1>
        </div>
        <Link className="btn primary" to="/blogs/posts/new">
          New post
        </Link>
      </div>
      <Banner kind="error">{error}</Banner>
      <div className="card">
        <div className="filters">
          <label className="field">
            <span>Search</span>
            <input type="search" value={q} placeholder="Title or slug" onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={filter("status")} onChange={(e) => update("status", e.target.value)}>
              <option value="">All</option>
              <option value="published">Live</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <select value={filter("category")} onChange={(e) => update("category", e.target.value)}>
              <option value="">All</option>
              {categories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Show</span>
            <select value={filter("flag")} onChange={(e) => update("flag", e.target.value)}>
              <option value="">All posts</option>
              <option value="featured">Featured</option>
              <option value="trending">Trending</option>
            </select>
          </label>
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.items.length === 0 ? (
          <p className="empty">No posts match. Try another word or filter.</p>
        ) : (
          <ul className="rows">
            {data.items.map((post) => (
              <li key={post.id} className="row">
                {post.coverImage ? <img className="row-thumb wide" src={smallestUrl(post.coverImage)} alt="" loading="lazy" /> : <span className="row-thumb wide" />}
                <span className="row-main">
                  <Link to={`/blogs/posts/${post.id}`} className="row-title">
                    {post.title || "Untitled post"}
                  </Link>
                  <span className="row-sub">
                    {post.category?.name || "No category"} · {formatDate(post.publishedAt)}
                  </span>
                  <span className="row-tags">
                    <StatusChip status={post.status} />
                    {post.featured ? <span className="pill featured">Featured</span> : null}
                    {post.trending ? <span className="pill trending">Trending #{post.trendingOrder}</span> : null}
                    <NeedsPhoto images={[post.coverImage]} />
                    {post.seoIssues?.length ? (
                      <span className="pill warn" title={post.seoIssues.join("\n")}>
                        {post.seoIssues.length} SEO {post.seoIssues.length === 1 ? "note" : "notes"}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="row-actions">
                  <Link className="btn small" to={`/blogs/posts/${post.id}`}>
                    Edit
                  </Link>
                  <Link className="btn small" to={`/blogs/posts/${post.id}/preview`}>
                    Preview
                  </Link>
                  <button type="button" className="btn small ghost" onClick={() => remove(post)}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {data && data.pages > 1 ? (
          <div className="pager">
            <span className="muted">
              Page {data.page} of {data.pages} · {data.total} posts
            </span>
            <span className="row-actions">
              <button type="button" className="btn small" disabled={page <= 1} onClick={() => update("page", String(page - 1))}>
                Previous
              </button>
              <button type="button" className="btn small" disabled={page >= data.pages} onClick={() => update("page", String(page + 1))}>
                Next
              </button>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
