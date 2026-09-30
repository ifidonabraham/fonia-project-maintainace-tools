import { clearSessionCookie } from "../../../../lib/auth/session";
import { ok, serverError } from "../../../../lib/http";

export const runtime = "nodejs";

/**
 * POST /api/auth/logout — clears the cookie. Realtime sockets for this user are
 * closed by the gateway's own teardown when the browser drops them; a revoked
 * session also fails the next handshake because the cookie is gone.
 */
export async function POST(): Promise<Response> {
  try {
    await clearSessionCookie();
    return ok({ signedOut: true });
  } catch (error) {
    return serverError(error, "auth/logout");
  }
}