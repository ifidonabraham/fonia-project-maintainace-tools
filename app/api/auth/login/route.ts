import { db } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/auth/password";
import { setSessionCookie } from "../../../../lib/auth/session";
import { fail, ok, parseBody, serverError } from "../../../../lib/http";
import { loginSchema } from "../../../../lib/validation";
import { toUserDTO } from "../../../../lib/serialize";

export const runtime = "nodejs";

/**
 * POST /api/auth/login
 *
 * One message for both "no such account" and "wrong password" — telling them
 * apart would turn this endpoint into an email-existence oracle. The scrypt
 * verification runs on the same code path either way.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = await parseBody(request, loginSchema);
    if (!parsed.ok) return parsed.response;

    const email = parsed.data.email.toLowerCase();
    const user = await db.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return fail("Those details did not match an account.", 401, { code: "bad_credentials" });
    }

    await setSessionCookie(user);

    return ok({
      user: toUserDTO({
        id: user.id,
        name: user.name,
        email: user.email,
        avatarColor: user.avatarColor
      })
    });
  } catch (error) {
    return serverError(error, "auth/login");
  }
}