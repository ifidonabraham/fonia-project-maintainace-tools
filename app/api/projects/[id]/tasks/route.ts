import { db } from "../../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../../lib/auth/guards";
import { fail, forbidden, ok, parseBody, serverError, unauthorized } from "../../../../../lib/http";
import { taskCreateSchema } from "../../../../../lib/validation";
import { logProjectEvent } from "../../../../../lib/realtime/events";
import { notify } from "../../../../../lib/realtime/notify";
import { nextPosition, toTaskDTO } from "../../../../../lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/projects/:id/tasks — create a card.
 *
 * New cards land at the bottom of their column, so the board never reorders
 * under someone who is not looking at it.
 */
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

    const parsed = await parseBody(request, taskCreateSchema);
    if (!parsed.ok) return parsed.response;

    const { columnId, title, description, priority, assigneeId, dueDate } = parsed.data;

    const column = await db.column.findFirst({
      where: { id: columnId, projectId: id },
      select: { id: true, name: true, isDone: true }
    });
    if (!column) {
      return fail("That column does not belong to this project.", 422, {
        code: "validation",
        fields: { columnId: "Choose a column in this project." }
      });
    }

    // An assignee must actually be a member — otherwise they would be notified
    // about a board they cannot open.
    let resolvedAssignee: string | null = null;
    if (assigneeId) {
      const member = await db.projectMember.findUnique({
        where: { projectId_userId: { projectId: id, userId: assigneeId } },
        select: { userId: true }
      });
      if (!member) {
        return fail("That person is not a member of this project.", 422, {
          code: "validation",
          fields: { assigneeId: "Pick a member of this project." }
        });
      }
      resolvedAssignee = assigneeId;
    }

    const last = await db.task.findFirst({
      where: { columnId },
      orderBy: { position: "desc" },
      select: { position: true }
    });

    const task = await db.task.create({
      data: {
        projectId: id,
        columnId,
        title,
        description: description?.trim() || null,
        priority: (priority as string) || "medium",
        position: nextPosition(last?.position),
        assigneeId: resolvedAssignee,
        createdById: user.id,
        dueDate: dueDate ?? null,
        completedAt: column.isDone ? new Date() : null
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        _count: { select: { comments: true } }
      }
    });

    const dto = toTaskDTO(task);

    await logProjectEvent({
      projectId: id,
      actorId: user.id,
      type: "task.created",
      payload: { taskId: task.id, title: task.title, columnName: column.name, task: dto }
    });

    if (resolvedAssignee) {
      await notify({
        userId: resolvedAssignee,
        actorId: user.id,
        type: "task.assigned",
        title: `${user.name} assigned you “${task.title}”`,
        body: `In ${column.name}`,
        projectId: id,
        taskId: task.id
      });
    }

    return ok({ task: dto }, 201);
  } catch (error) {
    return serverError(error, "POST /api/projects/:id/tasks");
  }
}