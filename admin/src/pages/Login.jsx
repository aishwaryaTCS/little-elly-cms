import { useState } from "react";
import { api } from "../api.js";
import { Banner, useAuth } from "../components.jsx";

export default function Login() {
  const { setAdmin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
      setAdmin(data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card stack" onSubmit={submit}>
        <div>
          <p className="kicker">Find a centre</p>
          <h1>Little Elly</h1>
          <p className="lede">Sign in to the centre desk.</p>
        </div>
        <Banner kind="error">{error}</Banner>
        <label className="field">
          Email
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
