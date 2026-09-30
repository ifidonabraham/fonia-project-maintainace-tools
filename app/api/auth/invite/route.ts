import { db } from "../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../lib/auth/guards";
import { fail, forbidden, ok, parseBody, serverError, unauthorized } from "../../../../lib/http";
import { sendEmail, inviteEmail, BASE } from "../../../../lib/email";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  projectId: z.string().min(1, "Project ID is required."),
  role: z.enum(["admin", "member"]).default("member")
});

/**
 * POST /api/auth/invite
 *
 * Two paths:
 *   1. Existing user  → add directly to project + send notification email.
 *   2. New email      → create pending Invite + send signup link email.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const parsed = await parseBody(request, schema);
    if (!parsed.ok) return parsed.response;

    const { email: rawEmail, projectId, role } = parsed.data;
    const email = rawEmail.toLowerCase();

    const access = await getProjectAccess(user.id, projectId);
    if (!access) return forbidden("You are not a member of this project.");
    if (access.role === "member") return forbidden("Only project admins can send invitations.");

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true }
    });
    if (!project) return fail("Project not found.", 404);

    // Path 1: existing user — add directly.
    const existingUser = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true }
    });

    if (existingUser) {
      const alreadyMember = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: existingUser.id } }
      });
      if (alreadyMember) {
        return fail("That person is already a member of this project.", 409, {
          code: "exists",
          fields: { email: "Already a member." }
        });
      }

      await db.projectMember.create({ data: { projectId, userId: existingUser.id, role } });

      const { subject, html } = inviteEmail({
        inviterName: user.name,
        projectName: project.name,
        inviteUrl: `${BASE()}/projects/${projectId}`,
        isNewUser: false
      });
      void sendEmail({ to: email, subject, html });

      return ok({
        added: true,
        isNewUser: false,
        message: `${existingUser.name} has been added to the project.`
      });
    }

    // Path 2: new user — create pending invite.
    await db.invite.deleteMany({ where: { email, projectId, usedAt: null } });

    const rawToken = randomBytes(32).toString("hex");
    const token = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.invite.create({
      data: { token, email, projectId, role, inviterId: user.id, expiresAt }
    });

    const inviteUrl = `${BASE()}/register?invite=${rawToken}&email=${encodeURIComponent(email)}`;
    const { subject, html } = inviteEmail({
      inviterName: user.name,
      projectName: project.name,
      inviteUrl,
      isNewUser: true
    });
    void sendEmail({ to: email, subject, html });

    return ok({
      added: false,
      isNewUser: true,
      message: `Invitation sent to ${email}. They'll be added to the project when they sign up.`
    });
  } catch (error) {
    return serverError(error, "POST /api/auth/invite");
  }
}
