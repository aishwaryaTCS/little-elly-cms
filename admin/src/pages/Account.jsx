import { useState } from "react";
import { api } from "../api.js";
import { Banner, useAuth } from "../components.jsx";

export default function Account() {
  const { admin } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setErrors({});
    try {
      await api("/api/auth/password", { method: "PATCH", body: { currentPassword, newPassword } });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated. This sign-in stays active, and older sessions are closed.");
    } catch (err) {
      setError(err.message);
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack">
      <header>
        <p className="kicker">Account</p>
        <h1>{admin?.name}</h1>
        <p className="muted">{admin?.email}</p>
      </header>
      <form className="card stack" onSubmit={submit}>
        <h2>Change password</h2>
        <p className="muted">Use 10 to 72 characters, with at least one letter and one number.</p>
        <Banner kind="error">{error}</Banner>
        <Banner kind="ok">{message}</Banner>
        <label className="field">
          Current password
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          {errors.currentPassword ? <em>{errors.currentPassword}</em> : null}
        </label>
        <label className="field">
          New password
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          {errors.newPassword ? <em>{errors.newPassword}</em> : null}
        </label>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </form>
    </div>
  );
}
