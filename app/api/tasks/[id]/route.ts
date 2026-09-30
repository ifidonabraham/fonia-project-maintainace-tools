import { db } from "../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../lib/auth/guards";
import { fail, forbidden, notFound, ok, parseBody, serverError, unauthorized } from "../../../../lib/http";
import { taskUpdateSchema } from "../../../../lib/validation";
import { logProjectEvent } from "../../../../lib/realtime/events";
import { notify } from "../../../../lib/realtime/notify";
import { toTaskDTO } from "../../../../lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH  /api/tasks/:id — edit a card
 * DELETE /api/tasks/:id — remove a card
 *
 * The edit path carries an optimistic-concurrency check: if the client's
 * `version` is behind the row, the write is refused with the current task so the
 * UI can show the newer state instead of silently overwriting a teammate.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const existing = await db.task.findUnique({ where: { id } });
    if (!existing) return notFound("Task");

    const access = await getProjectAccess(user.id, existing.projectId);
    if (!access) return forbidden("You are not a member of this project.");

    const parsed = await parseBody(request, taskUpdateSchema);
    if (!parsed.ok) return parsed.response;

    const { title, description, priority, assigneeId, dueDate, version } = parsed.data;

    if (version !== undefined && version !== existing.version) {
      const current = await db.task.findUnique({
        where: { id },
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
          creator: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
          _count: { select: { comments: true } }
        }
      });
      return fail("This task changed while you were editing it.", 409, {
        code: "conflict",
        current: current ? toTaskDTO(current) : null
      });
    }

    if (assigneeId) {
      const member = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: existing.projectId, userId: assigneeId } },
        select: { userId: true }
      });
      if (!member) {
        return fail("That person is not a member of this project.", 422, {
          code: "validation",
          fields: { assigneeId: "Pick a member of this project." }
        });
      }
    }

    const assigneeChanged = assigneeId !== undefined && assigneeId !== existing.assigneeId;

    const task = await db.task.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(assigneeId !== undefined ? { assigneeId: assigneeId || null } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ?? null } : {}),
        version: { increment: 1 }
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        _count: { select: { comments: true } }
      }
    });

    const dto = toTaskDTO(task);

    await logProjectEvent({
      projectId: existing.projectId,
      actorId: user.id,
      type: "task.updated",
      payload: {
        taskId: task.id,
        title: task.title,
        task: dto,
        assigneeName: task.assignee?.name ?? null
      }
    });

    if (assigneeChanged) {
      if (task.assigneeId) {
        await notify({
          userId: task.assigneeId,
          actorId: user.id,
          type: "task.assigned",
          title: `${user.name} assigned you “${task.title}”`,
          projectId: existing.projectId,
          taskId: task.id
        });
      } else if (existing.assigneeId) {
        await notify({
          userId: existing.assigneeId,
          actorId: user.id,
          type: "task.unassigned",
          title: `${user.name} unassigned “${task.title}”`,
          projectId: existing.projectId,
          taskId: task.id
        });
      }
    }

    return ok({ task: dto });
  } catch (error) {
    return serverError(error, "PATCH /api/tasks/:id");
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
    const existing = await db.task.findUnique({
      where: { id },
      select: { id: true, projectId: true, title: true }
    });
    if (!existing) return notFound("Task");

    const access = await getProjectAccess(user.id, existing.projectId);
    if (!access) return forbidden("You are not a member of this project.");

    await db.task.delete({ where: { id } });

    await logProjectEvent({
      projectId: existing.projectId,
      actorId: user.id,
      type: "task.deleted",
      payload: { taskId: existing.id, title: existing.title }
    });

    return ok({ deleted: true });
  } catch (error) {
    return serverError(error, "DELETE /api/tasks/:id");
  }
}