import Link from "next/link";
import { Logo } from "./Logo";
import type { UserDTO } from "../lib/types";

/**
 * Header for the public pages. Signed-in visitors get a direct route back to
 * their boards instead of the sign-in prompt.
 */
export function SiteHeader({ user }: { user: UserDTO | null }) {
  return (
    <header className="nav">
      <div className="container">
        <div className="nav-inner">
          <Logo />

          <nav className="nav-links" aria-label="Main navigation">
            <Link href="/#features">Features</Link>
            <Link href="/#realtime">Realtime</Link>
            <Link href="/#how">How it works</Link>
          </nav>

          <div className="nav-cta">
            {user ? (
              <Link className="btn primary" href="/dashboard">
                Open dashboard <span className="btn-arrow">→</span>
              </Link>
            ) : (
              <>
                <Link className="btn ghost" href="/login">
                  Sign in
                </Link>
                <Link className="btn primary" href="/register">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}