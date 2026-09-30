import { db } from "../../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../../lib/auth/guards";
import { fail, forbidden, notFound, ok, parseBody, serverError, unauthorized } from "../../../../../lib/http";
import { taskMoveSchema } from "../../../../../lib/validation";
import { logProjectEvent } from "../../../../../lib/realtime/events";
import { notify } from "../../../../../lib/realtime/notify";
import { positionBetween, toTaskDTO } from "../../../../../lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/tasks/:id/move — drag a card to another column (or another spot).
 *
 * Ordering uses fractional positions. The client sends the two cards it dropped
 * between, and the server stores the midpoint of their positions, so a move is
 * one UPDATE instead of renumbering a whole column.
 */
export async function POST(
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

    const parsed = await parseBody(request, taskMoveSchema);
    if (!parsed.ok) return parsed.response;

    const { columnId, beforeTaskId, afterTaskId, version } = parsed.data;

    if (version !== undefined && version !== existing.version) {
      return fail("This card moved while you were dragging it.", 409, { code: "conflict" });
    }

    const column = await db.column.findFirst({
      where: { id: columnId, projectId: existing.projectId },
      select: { id: true, name: true, isDone: true }
    });
    if (!column) {
      return fail("That column does not belong to this project.", 422, {
        code: "validation",
        fields: { columnId: "Choose a column in this project." }
      });
    }

    // Neighbour positions must come from the target column, otherwise a stale
    // client could wedge a card between two cards that are not its siblings.
    const neighbourIds = [beforeTaskId, afterTaskId].filter((value): value is string => Boolean(value));
    const neighbours = neighbourIds.length
      ? await db.task.findMany({
          where: { id: { in: neighbourIds }, columnId },
          select: { id: true, position: true }
        })
      : [];

    const before = neighbours.find((task) => task.id === beforeTaskId)?.position ?? null;
    const after = neighbours.find((task) => task.id === afterTaskId)?.position ?? null;

    const wasDone = existing.completedAt !== null;

    const task = await db.task.update({
      where: { id },
      data: {
        columnId,
        position: positionBetween(before, after),
        version: { increment: 1 },
        completedAt: column.isDone ? existing.completedAt ?? new Date() : null
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
      type: "task.moved",
      payload: {
        taskId: task.id,
        title: task.title,
        columnName: column.name,
        fromColumnId: existing.columnId,
        columnId: column.id,
        task: dto
      }
    });

    // Reaching a "done" column is the moment worth telling the task's people about.
    if (column.isDone && !wasDone) {
      const recipients = [task.assigneeId, task.createdById].filter(
        (value): value is string => Boolean(value)
      );
      for (const recipient of Array.from(new Set(recipients))) {
        await notify({
          userId: recipient,
          actorId: user.id,
          type: "task.done",
          title: `“${task.title}” was marked done`,
          body: `${user.name} moved it to ${column.name}`,
          projectId: existing.projectId,
          taskId: task.id
        });
      }
    }

    return ok({ task: dto });
  } catch (error) {
    return serverError(error, "POST /api/tasks/:id/move");
  }
}