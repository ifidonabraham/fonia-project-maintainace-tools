import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../constants";
import { signSession, verifySession, type SessionPayload } from "./jwt";

/**
 * Session transport: a signed HS256 JWT in an httpOnly cookie.
 *
 * httpOnly keeps the token away from JavaScript (so an XSS bug cannot read it),
 * SameSite=Lax blocks cross-site POSTs from riding the session, and `secure` is
 * switched on automatically in production. The realtime gateway reads the very
 * same cookie off the WebSocket upgrade request, which means one session
 * mechanism protects both HTTP and sockets.
 */

export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL || 60 * 60 * 24 * 30);

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET is missing or shorter than 32 characters. Check your .env file.");
  }
  return secret;
}

export function createSessionToken(user: { id: string; name: string; email: string }): string {
  return signSession(
    { sub: user.id, email: user.email, name: user.name },
    authSecret(),
    SESSION_TTL_SECONDS
  );
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  const result = verifySession(token, authSecret());
  return result.ok ? result.payload : null;
}

/** Set the session cookie (route handlers / server actions only). */
export async function setSessionCookie(user: { id: string; name: string; email: string }): Promise<string> {
  const token = createSessionToken(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
  return token;
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

/** Current session inside a Server Component / route handler. */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/** Minimal cookie header parser — used by the gateway, which has no Next context. */
export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

/** Authenticate a raw HTTP upgrade / SSE request. */
export function sessionFromCookieHeader(header: string | undefined): SessionPayload | null {
  return verifySessionToken(parseCookie(header, SESSION_COOKIE));
}