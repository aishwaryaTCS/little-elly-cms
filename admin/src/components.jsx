import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, setUnauthorizedHandler } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(undefined);

  useEffect(() => {
    setUnauthorizedHandler(() => setAdmin(null));
    api("/api/auth/me")
      .then((data) => setAdmin(data.admin))
      .catch(() => setAdmin(null));
  }, []);

  return <AuthContext.Provider value={{ admin, setAdmin }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function Shell() {
  const { setAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAdmin(null);
    navigate("/login");
  }

  return (
    <div className="shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="mark">Le</div>
          <div>
            <strong>Little Elly</strong>
            <span>CMS</span>
          </div>
        </div>
        <button className="menu-toggle" type="button" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen((value) => !value)}>
          {open ? "Close menu" : "Menu"}
        </button>
        <nav className="nav" id="main-nav" aria-label="Main" onClick={(event) => event.target.closest("a") && setOpen(false)}>
          <NavLink to="/" end>Dashboard</NavLink>
          <p className="nav-group">Website</p>
          <NavLink to="/website/team">Our team</NavLink>
          <NavLink to="/website/awards">Awards</NavLink>
          <NavLink to="/website/programs">Programs</NavLink>
          <NavLink to="/website/parent-voices">Parent voices</NavLink>
          <NavLink to="/website/news">News & events</NavLink>
          <p className="nav-group">Blogs</p>
          <NavLink to="/blogs/posts">Posts</NavLink>
          <NavLink to="/blogs/categories">Categories</NavLink>
          <NavLink to="/blogs/page">Blog page</NavLink>
          <p className="nav-group">Centres</p>
          <NavLink to="/centres">Centres</NavLink>
          <NavLink to="/finder">Finder page</NavLink>
          <NavLink to="/defaults">Shared defaults</NavLink>
          <p className="nav-group">SEO</p>
          <NavLink to="/seo/pages">Pages</NavLink>
          <NavLink to="/seo/site">Site settings</NavLink>
          <p className="nav-group" aria-hidden="true" />
          <NavLink to="/account">Account</NavLink>
        </nav>
        <button className="btn" type="button" onClick={logout}>
          Sign out
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function Banner({ kind = "info", children }) {
  if (!children) return null;
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function getAt(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

export function setAt(object, path, value) {
  const next = structuredClone(object);
  const parts = path.split(".");
  let cursor = next;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (cursor[parts[index]] == null || typeof cursor[parts[index]] !== "object") cursor[parts[index]] = {};
    cursor = cursor[parts[index]];
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

export function moveItem(list, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function Field({ label, hint, error, className = "", children }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
      {error ? <em>{error}</em> : null}
    </label>
  );
}

export function Fields({ doc, setDoc, errors, rows }) {
  return (
    <div className="grid-2">
      {rows.map((row) => (
        <Field key={row.path} label={row.label} hint={row.hint} error={errors[row.path]} className={row.wide ? "span-2" : ""}>
          {row.type === "area" ? (
            <textarea
              rows={row.rows || 3}
              value={getAt(doc, row.path) ?? ""}
              autoComplete="off"
              onChange={(event) => setDoc((current) => setAt(current, row.path, event.target.value))}
            />
          ) : (
            <input
              type={row.type === "number" ? "number" : "text"}
              value={getAt(doc, row.path) ?? ""}
              autoComplete="off"
              onChange={(event) => {
                const raw = event.target.value;
                const value = row.type === "number" ? (raw === "" ? "" : Number(raw)) : raw;
                setDoc((current) => setAt(current, row.path, value));
              }}
            />
          )}
        </Field>
      ))}
    </div>
  );
}

export function StringList({ items, onChange, addLabel, placeholder, error }) {
  return (
    <div className="list">
      {items.map((item, index) => (
        <div className="inline single" key={`${index}-${items.length}`}>
          <input
            value={item}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(event) => onChange(items.map((value, itemIndex) => (itemIndex === index ? event.target.value : value)))}
          />
          <button className="btn small" type="button" onClick={() => onChange(moveItem(items, index, -1))} disabled={index === 0}>Up</button>
          <button className="btn small" type="button" onClick={() => onChange(moveItem(items, index, 1))} disabled={index === items.length - 1}>Down</button>
          <button className="btn small" type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>
      ))}
      {error ? <em className="error-text">{error}</em> : null}
      <button className="btn ghost" type="button" onClick={() => onChange([...items, ""])}>{addLabel}</button>
    </div>
  );
}

export function PairList({ items, onChange, left, right, leftLabel, rightLabel, addLabel, error }) {
  function update(index, key, value) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  }
  return (
    <div className="list">
      {items.map((item, index) => (
        <div className="inline" key={`${index}-${items.length}`}>
          <input value={item[left] ?? ""} placeholder={leftLabel} autoComplete="off" onChange={(event) => update(index, left, event.target.value)} />
          <input value={item[right] ?? ""} placeholder={rightLabel} autoComplete="off" onChange={(event) => update(index, right, event.target.value)} />
          <button className="btn small" type="button" onClick={() => onChange(moveItem(items, index, -1))} disabled={index === 0}>Up</button>
          <button className="btn small" type="button" onClick={() => onChange(moveItem(items, index, 1))} disabled={index === items.length - 1}>Down</button>
          <button className="btn small" type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>
      ))}
      {error ? <em className="error-text">{error}</em> : null}
      <button className="btn ghost" type="button" onClick={() => onChange([...items, { [left]: "", [right]: "" }])}>{addLabel}</button>
    </div>
  );
}

export function ImageField({ image, onChange, disabled }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const data = await api("/api/admin/uploads", { method: "POST", body });
      onChange(data.image);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-field">
      {image?.url ? <img className="thumb" src={image.url} alt="" /> : <div className="thumb" />}
      <div className="list">
        <label className="btn">
          {busy ? "Uploading…" : image ? "Replace photo" : "Upload photo"}
          <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={disabled || busy} />
        </label>
        {image ? (
          <button className="btn ghost" type="button" onClick={() => onChange(null)} disabled={disabled || busy}>
            Remove photo
          </button>
        ) : (
          <small className="help">JPEG, PNG, or WebP. 5 MB maximum.</small>
        )}
        {error ? <em className="error-text">{error}</em> : null}
      </div>
    </div>
  );
}
