import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A hand-written HS256 JWT implementation (RFC 7519).
 *
 * Why not a library? The session token is the one place we can keep the whole
 * auth story dependency-free, and HS256 is small enough to implement exactly:
 * base64url(header) + "." + base64url(payload), signed with HMAC-SHA256 and
 * compared in constant time. Every rule below is deliberate:
 *
 *  - `alg` is checked before the signature, so a forged `{"alg":"none"}` header
 *    is rejected instead of trusted.
 *  - the signature is verified with timingSafeEqual (no early-exit oracle).
 *  - `exp`, `nbf` and `iat` are all enforced, with 60s of clock tolerance.
 *  - the payload must satisfy the session shape, so a valid-but-wrong token
 *    type cannot be smuggled in.
 */

export type SessionPayload = {
  /** user id */
  sub: string;
  /** email, kept in the token so the UI can render without a database read */
  email: string;
  name: string;
  /** issued at (seconds) */
  iat: number;
  /** expiry (seconds) */
  exp: number;
};

const HEADER = { alg: "HS256", typ: "JWT" } as const;
const CLOCK_TOLERANCE_SECONDS = 60;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sub === "string" &&
    v.sub.length > 0 &&
    typeof v.email === "string" &&
    typeof v.name === "string" &&
    typeof v.iat === "number" &&
    typeof v.exp === "number"
  );
}

export function signSession(
  payload: Omit<SessionPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds: number
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + ttlSeconds };

  const encodedHeader = base64url(JSON.stringify(HEADER));
  const encodedPayload = base64url(JSON.stringify(full));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(secret, data);

  return `${data}.${signature.toString("base64url")}`;
}

export type VerifyResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; reason: "malformed" | "bad-algorithm" | "bad-signature" | "expired" | "not-yet-valid" | "bad-claims" };

export function verifySession(token: string | undefined | null, secret: string): VerifyResult {
  if (!token) return { ok: false, reason: "malformed" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: { alg?: string; typ?: string };
  let payload: unknown;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // Algorithm check happens BEFORE signature verification on purpose.
  if (header?.alg !== "HS256" || header?.typ !== "JWT") {
    return { ok: false, reason: "bad-algorithm" };
  }

  const expectedSignature = sign(secret, `${encodedHeader}.${encodedPayload}`);
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return { ok: false, reason: "bad-signature" };
  }

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return { ok: false, reason: "bad-signature" };
  }

  if (!isSessionPayload(payload)) return { ok: false, reason: "bad-claims" };

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp + CLOCK_TOLERANCE_SECONDS < now) return { ok: false, reason: "expired" };
  if (payload.iat - CLOCK_TOLERANCE_SECONDS > now) return { ok: false, reason: "not-yet-valid" };

  return { ok: true, payload };
}