import { db } from "../../../../lib/db";
import { hashPassword, passwordProblem } from "../../../../lib/auth/password";
import { setSessionCookie } from "../../../../lib/auth/session";
import { fail, ok, parseBody, serverError } from "../../../../lib/http";
import { registerSchema } from "../../../../lib/validation";
import { LIMITS, pickAvatarColor } from "../../../../lib/constants";
import { toUserDTO } from "../../../../lib/serialize";
import { sendEmail, welcomeEmail, BASE } from "../../../../lib/email";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";

export const runtime = "nodejs";

const registerWithInviteSchema = registerSchema.extend({
  inviteToken: z.string().optional()
});

/**
 * POST /api/auth/register
 *
 * Creates the account, signs the user in, and fires a verification email.
 * If an inviteToken is present the user is automatically added to the
 * invited project after account creation.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = await parseBody(request, registerWithInviteSchema);
    if (!parsed.ok) return parsed.response;

    const name = parsed.data.name;
    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;
    const rawInviteToken = parsed.data.inviteToken;

    const weakness = passwordProblem(password, LIMITS.password);
    if (weakness) {
      return fail(weakness, 422, { code: "validation", fields: { password: weakness } });
    }

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return fail("An account with that email already exists.", 409, {
        code: "email_taken",
        fields: { email: "An account with that email already exists. Try signing in." }
      });
    }

    // Validate invite token upfront (don't fail registration if expired, just skip).
    let invite: { id: string; projectId: string; role: string } | null = null;
    if (rawInviteToken) {
      const hashedToken = createHash("sha256").update(rawInviteToken).digest("hex");
      invite = await db.invite.findFirst({
        where: { token: hashedToken, email, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, projectId: true, role: true }
      });
    }

    // Create verification token (24 h).
    const rawVerifyToken = randomBytes(32).toString("hex");
    const verifyToken = createHash("sha256").update(rawVerifyToken).digest("hex");
    const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await db.user.create({
      data: {
        name, email,
        passwordHash: await hashPassword(password),
        avatarColor: pickAvatarColor(email),
        verifyToken, verifyTokenExp
      },
      select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true }
    });

    // Consume invite → add user to project.
    if (invite) {
      await db.projectMember.create({
        data: { projectId: invite.projectId, userId: user.id, role: invite.role }
      });
      await db.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
    }

    await setSessionCookie(user);

    // Fire verification email (non-blocking).
    const verifyUrl = `${BASE()}/api/auth/verify-email?token=${rawVerifyToken}`;
    const { subject, html } = welcomeEmail({ name, verifyUrl });
    void sendEmail({ to: email, subject, html });

    return ok({
      user: toUserDTO(user),
      redirectTo: invite ? `/projects/${invite.projectId}` : null
    }, 201);
  } catch (error) {
    return serverError(error, "auth/register");
  }
}
