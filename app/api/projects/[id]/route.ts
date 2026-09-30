import { db } from "../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../lib/auth/guards";
import { forbidden, notFound, ok, parseBody, serverError, unauthorized } from "../../../../lib/http";
import { projectUpdateSchema } from "../../../../lib/validation";
import { logProjectEvent } from "../../../../lib/realtime/events";
import { notifyMany, publishAccessChange } from "../../../../lib/realtime/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH  /api/projects/:id — rename, re-describe, recolour or archive (admins)
 * DELETE /api/projects/:id — remove the project entirely (owner only)
 */

export async function PATCH(
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
      return forbidden("Only project admins can change the project settings.");
    }

    const parsed = await parseBody(request, projectUpdateSchema);
    if (!parsed.ok) return parsed.response;

    const { name, description, color, archived } = parsed.data;

    const project = await db.project.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {})
      }
    });

    await logProjectEvent({
      projectId: id,
      actorId: user.id,
      type: "project.updated",
      payload: { name: project.name }
    });

    if (name !== undefined) {
      const members = await db.projectMember.findMany({
        where: { projectId: id, userId: { not: user.id } },
        select: { userId: true }
      });
      await notifyMany(members.map((row) => row.userId), {
        actorId: user.id,
        type: "project.updated",
        title: `${user.name} renamed the project to “${project.name}”`,
        projectId: id
      });
    }

    return ok({ project: { id: project.id, name: project.name, description: project.description } });
  } catch (error) {
    return serverError(error, "PATCH /api/projects/:id");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const access = await getProjectAccess(user.id, id);
    if (!access) return notFound("Project");
    if (access.role !== "owner") {
      return forbidden("Only the project owner can delete the project.");
    }

    const members = await db.projectMember.findMany({
      where: { projectId: id, userId: { not: user.id } },
      select: { userId: true }
    });

    // Cascades remove columns, tasks, comments, events and memberships.
    await db.project.delete({ where: { id } });

    // Their sockets should stop expecting this project immediately.
    for (const member of members) {
      await publishAccessChange(member.userId, id, "removed");
    }

    return ok({ deleted: true });
  } catch (error) {
    return serverError(error, "DELETE /api/projects/:id");
  }
}