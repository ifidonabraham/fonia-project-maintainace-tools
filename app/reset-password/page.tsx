"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, errorMessage } from "../../lib/client/api";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      setDone(true);
      setTimeout(() => router.replace("/login"), 2500);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) return (
    <p style={{ color: "var(--red)", fontSize: 14 }}>
      Invalid reset link.{" "}
      <Link href="/forgot-password" style={{ color: "var(--cyan)" }}>Request a new one</Link>.
    </p>
  );

  if (done) return (
    <p style={{ color: "var(--muted-soft)", lineHeight: 1.6, margin: "16px 0" }}>
      ✓ Password updated! Redirecting you to sign in…
    </p>
  );

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      <p style={{ color: "var(--muted-soft)", fontSize: 14, margin: "12px 0 20px", lineHeight: 1.5 }}>
        Choose a new password for your Fonia Projects account.
      </p>

      <div className="field full">
        <label htmlFor="rp-password">New password</label>
        <input
          id="rp-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <div className="field full">
        <label htmlFor="rp-confirm">Confirm new password</label>
        <input
          id="rp-confirm"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={busy || !password || !confirm}>
          {busy ? "Updating…" : "Set new password"}
          {!busy && <span className="btn-arrow">→</span>}
        </button>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-wrap">
      <main className="auth-main" style={{ maxWidth: 440, margin: "0 auto", paddingTop: 80 }}>
        <div className="form-card auth-card">
          <h2>Set a new password</h2>
          <Suspense fallback={<p style={{ color: "var(--muted-soft)" }}>Loading…</p>}>
            <ResetForm />
          </Suspense>
          <p className="auth-switch mt-md">
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
