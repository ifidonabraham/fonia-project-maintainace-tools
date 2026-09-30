import { db } from "../../../../lib/db";
import { hashPassword, passwordProblem } from "../../../../lib/auth/password";
import { fail, ok, parseBody, serverError } from "../../../../lib/http";
import { LIMITS } from "../../../../lib/constants";
import { createHash } from "node:crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1, "Token is required."),
  password: z.string().min(1, "Password is required.")
});

/**
 * POST /api/auth/reset-password
 * Validates the reset token and sets a new password. Token is single-use.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;

    const { token: rawToken, password } = parsed.data;

    const weakness = passwordProblem(password, LIMITS.password);
    if (weakness) {
      return fail(weakness, 422, { code: "validation", fields: { password: weakness } });
    }

    const hashedToken = createHash("sha256").update(rawToken).digest("hex");
    const user = await db.user.findFirst({
      where: { resetToken: hashedToken, resetTokenExp: { gt: new Date() } },
      select: { id: true }
    });

    if (!user) {
      return fail("This reset link is invalid or has expired. Please request a new one.", 400, {
        code: "token_invalid"
      });
    }

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), resetToken: null, resetTokenExp: null }
    });

    return ok({ message: "Password updated. You can now sign in with your new password." });
  } catch (error) {
    return serverError(error, "POST /api/auth/reset-password");
  }
}
