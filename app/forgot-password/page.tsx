"use client";

import { useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "../../lib/client/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <main className="auth-main" style={{ maxWidth: 440, margin: "0 auto", paddingTop: 80 }}>
        <div className="form-card auth-card">
          <h2>Reset your password</h2>

          {sent ? (
            <>
              <p style={{ color: "var(--muted-soft)", lineHeight: 1.6, margin: "16px 0" }}>
                If an account exists for <strong style={{ color: "var(--fg)" }}>{email}</strong>,
                a reset link has been sent. Check your inbox — it may take a minute.
              </p>
              <button
                className="btn ghost"
                onClick={() => setSent(false)}
                style={{ marginTop: 8 }}
              >
                Try a different email
              </button>
            </>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} noValidate>
              <p style={{ color: "var(--muted-soft)", fontSize: 14, margin: "12px 0 20px", lineHeight: 1.5 }}>
                Enter your account email and we&apos;ll send you a link to reset your password.
              </p>

              <div className="field full">
                <label htmlFor="fp-email">Email address</label>
                <input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {error ? <p className="form-error" role="alert">{error}</p> : null}

              <div className="form-actions">
                <button className="btn primary" type="submit" disabled={busy || !email.trim()}>
                  {busy ? "Sending…" : "Send reset link"}
                  {!busy && <span className="btn-arrow">→</span>}
                </button>
              </div>
            </form>
          )}

          <p className="auth-switch mt-md">
            Remember your password?{" "}
            <Link href="/login">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
