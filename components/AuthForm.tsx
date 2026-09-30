"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, api } from "../lib/client/api";
import { useToast } from "./Toast";
import { LIMITS } from "../lib/constants";

type Mode = "login" | "register";

/**
 * One form for both sign-in and sign-up — the fields are nearly identical, and
 * sharing it keeps the validation messages, error handling and redirect logic
 * identical on both pages.
 */
export function AuthForm({
  mode,
  next,
  inviteToken,
  prefillEmail
}: {
  mode: Mode;
  next?: string;
  inviteToken?: string;
  prefillEmail?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(prefillEmail ?? "");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isRegister = mode === "register";
  const destination = next && next.startsWith("/") ? next : "/dashboard";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFormError(null);
    setFieldErrors({});

    try {
      if (isRegister) {
        const data = await api.post<{ user: unknown; redirectTo: string | null }>("/api/auth/register", { name, email, password, inviteToken });
        toast.success("Account created", "Welcome to Fonia Projects.");
        const dest = data.redirectTo ?? destination;
        router.replace(dest);
        router.refresh();
      } else {
        await api.post("/api/auth/login", { email, password });
        toast.success("Signed in", "Your boards are live.");
        router.replace(destination);
        router.refresh();
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        if (error.fields) setFieldErrors(error.fields);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  return (
    <form className="form-card auth-card" onSubmit={handleSubmit} noValidate>
      <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
      <p className="mb-md">
        {isRegister
          ? "Start a project, invite your team, and keep the board moving."
          : "Sign in to pick up where your team left off."}
      </p>

      {formError ? <p className="form-error mb-md">{formError}</p> : null}

      <div className="form-grid">
        {isRegister ? (
          <div className="field full">
            <label htmlFor="auth-name">
              Full name <span className="req">*</span>
            </label>
            <input
              id="auth-name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your full name"
              required
            />
            {fieldErrors.name ? <p className="field-hint">{fieldErrors.name}</p> : null}
          </div>
        ) : null}

        <div className="field full">
          <label htmlFor="auth-email">
            Email address <span className="req">*</span>
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />
          {fieldErrors.email ? <p className="field-hint">{fieldErrors.email}</p> : null}
        </div>

        <div className="field full">
          <label htmlFor="auth-password">
            Password <span className="req">*</span>
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isRegister ? `At least ${LIMITS.password} characters` : "Your password"}
            required
          />
          {fieldErrors.password ? (
            <p className="field-hint">{fieldErrors.password}</p>
          ) : isRegister ? (
            <p className="field-hint">
              Minimum {LIMITS.password} characters, including at least one letter and one number.
            </p>
          ) : null}
        </div>
      </div>

      <div className="form-actions">
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          {!pending ? <span className="btn-arrow">→</span> : null}
        </button>
      </div>

      <p className="auth-switch mt-md">
        {isRegister ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            <Link href="/forgot-password" style={{ color: "var(--muted-soft)", fontSize: 13 }}>
              Forgot your password?
            </Link>
            <br />
            New to Fonia Projects? <Link href="/register">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}