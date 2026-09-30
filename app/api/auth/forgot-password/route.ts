import { db } from "../../../../lib/db";
import { ok, parseBody, serverError } from "../../../../lib/http";
import { sendEmail, passwordResetEmail, BASE } from "../../../../lib/email";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email("Enter a valid email address.")
});

/**
 * POST /api/auth/forgot-password
 *
 * Always returns 200 to prevent account enumeration. A reset link is
 * emailed only when the account exists.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;

    const email = parsed.data.email.toLowerCase();
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true }
    });

    if (user) {
      const rawToken = randomBytes(32).toString("hex");
      const resetToken = createHash("sha256").update(rawToken).digest("hex");
      const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExp }
      });

      const resetUrl = `${BASE()}/reset-password?token=${rawToken}`;
      const { subject, html } = passwordResetEmail({ name: user.name, resetUrl });
      void sendEmail({ to: user.email, subject, html });
    }

    return ok({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (error) {
    return serverError(error, "POST /api/auth/forgot-password");
  }
}
