import { db } from "../../../../../lib/db";
import {
  findUserByEmail,
  getCurrentUser,
  getProjectAccess
} from "../../../../../lib/auth/guards";
import { fail, forbidden, notFound, ok, parseBody, serverError, unauthorized } from "../../../../../lib/http";
import { memberAddSchema } from "../../../../../lib/validation";
import { logProjectEvent } from "../../../../../lib/realtime/events";
import { notify, publishAccessChange } from "../../../../../lib/realtime/notify";
import { toMemberDTO } from "../../../../../lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET    /api/projects/:id/members          — list members
 * POST   /api/projects/:id/members          — add an existing account by email
 * DELETE /api/projects/:id/members?userId=  — remove a member
 *
 * Adding a member publishes an `access` frame to that person's sockets, so the
 * new project appears in their sidebar without a reload. Removing one evicts
 * their socket from the project room first, so they stop receiving board events
 * immediately rather than on their next page load.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const access = await getProjectAccess(user.id, id);
    if (!access) return forbidden("You are not a member of this project.");

    const members = await db.projectMember.findMany({
      where: { projectId: id },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } } }
    });

    return ok({
      members: members.map((member) =>
        toMemberDTO({
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          avatarColor: member.user.avatarColor,
          role: member.role,
          joinedAt: member.joinedAt
        })
      )
    });
  } catch (error) {
    return serverError(error, "GET /api/projects/:id/members");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const access = await getProjectAccess(user.id, id);
    if (!access) return forbidden("You are not a member of this project.");
    if (access.role === "member") {
      return forbidden("Only project admins can add members.");
    }

    const parsed = await parseBody(request, memberAddSchema);
    if (!parsed.ok) return parsed.response;

    const invitee = await findUserByEmail(parsed.data.email);
    if (!invitee) {
      return fail("No account uses that email yet.", 422, {
        code: "validation",
        fields: { email: "There is no Fonia Projects account with that email." }
      });
    }

    const already = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: invitee.id } },
      select: { id: true }
    });
    if (already) {
      return fail("They are already a member of this project.", 409, {
        code: "exists",
        fields: { email: "Already a member." }
      });
    }

    const member = await db.projectMember.create({
      data: { projectId: id, userId: invitee.id, role: parsed.data.role || "member" },
      include: {
        user: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        project: { select: { name: true } }
      }
    });

    await logProjectEvent({
      projectId: id,
      actorId: user.id,
      type: "member.added",
      payload: { memberName: invitee.name, userId: invitee.id }
    });

    await notify({
      userId: invitee.id,
      actorId: user.id,
      type: "project.added",
      title: `${user.name} added you to “${member.project.name}”`,
      projectId: id
    });
    await publishAccessChange(invitee.id, id, "added");

    return ok(
      {
        member: toMemberDTO({
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          avatarColor: member.user.avatarColor,
          role: member.role,
          joinedAt: member.joinedAt
        })
      },
      201
    );
  } catch (error) {
    return serverError(error, "POST /api/projects/:id/members");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const access = await getProjectAccess(user.id, id);
    if (!access) return forbidden("You are not a member of this project.");

    const targetUserId = new URL(request.url).searchParams.get("userId");
    if (!targetUserId) return fail("A userId query parameter is required.");

    const target = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId: targetUserId } },
      include: { user: { select: { id: true, name: true } } }
    });
    if (!target) return notFound("Member");

    // A member may always remove themselves; removing someone else needs admin.
    const removingSelf = targetUserId === user.id;
    if (!removingSelf && access.role === "member") {
      return forbidden("Only project admins can remove other members.");
    }
    if (target.role === "owner") {
      return forbidden("The project owner cannot be removed.");
    }

    await db.projectMember.delete({
      where: { projectId_userId: { projectId: id, userId: targetUserId } }
    });

    // Unassign their cards so the board never points at a non-member.
    await db.task.updateMany({
      where: { projectId: id, assigneeId: targetUserId },
      data: { assigneeId: null }
    });

    await logProjectEvent({
      projectId: id,
      actorId: user.id,
      type: "member.removed",
      payload: { memberName: target.user.name, userId: targetUserId }
    });

    await publishAccessChange(targetUserId, id, "removed");

    return ok({ removed: true });
  } catch (error) {
    return serverError(error, "DELETE /api/projects/:id/members");
  }
}