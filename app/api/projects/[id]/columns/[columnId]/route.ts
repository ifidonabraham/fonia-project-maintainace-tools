import { db } from "../../../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../../../lib/auth/guards";
import { forbidden, notFound, ok, parseBody, serverError, unauthorized } from "../../../../../../lib/http";
import { columnUpdateSchema } from "../../../../../../lib/validation";
import { logProjectEvent } from "../../../../../../lib/realtime/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH  /api/projects/:id/columns/:columnId — rename, reorder, mark as done
 * DELETE /api/projects/:id/columns/:columnId — remove a column and its cards
 *
 * Only one column may be the "done" column, so setting `isDone` clears it from
 * the others in the same transaction — that keeps "done counts" unambiguous.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; columnId: string }> }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id, columnId } = await params;
    const access = await getProjectAccess(user.id, id);
    if (!access) return forbidden("You are not a member of this project.");
    if (access.role === "member") {
      return forbidden("Only project admins can change the board columns.");
    }

    const existing = await db.column.findFirst({
      where: { id: columnId, projectId: id },
      select: { id: true, name: true }
    });
    if (!existing) return notFound("Column");

    const parsed = await parseBody(request, columnUpdateSchema);
    if (!parsed.ok) return parsed.response;

    const { name, position, isDone } = parsed.data;

    const column = await db.$transaction(async (tx) => {
      if (isDone === true) {
        await tx.column.updateMany({
          where: { projectId: id, id: { not: columnId } },
          data: { isDone: false }
        });
      }

      return tx.column.update({
        where: { id: columnId },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(position !== undefined ? { position } : {}),
          ...(isDone !== undefined ? { isDone } : {})
        }
      });
    });

    await logProjectEvent({
      projectId: id,
      actorId: user.id,
      type: "column.updated",
      payload: { columnId: column.id, columnName: column.name, isDone: column.isDone }
    });

    return ok({
      column: {
        id: column.id,
        name: column.name,
        position: column.position,
        isDone: column.isDone
      }
    });
  } catch (error) {
    return serverError(error, "PATCH /api/projects/:id/columns/:columnId");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; columnId: string }> }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id, columnId } = await params;
    const access = await getProjectAccess(user.id, id);
    if (!access) return forbidden("You are not a member of this project.");
    if (access.role === "member") {
      return forbidden("Only project admins can change the board columns.");
    }

    const existing = await db.column.findFirst({
      where: { id: columnId, projectId: id },
      select: { id: true, name: true }
    });
    if (!existing) return notFound("Column");

    const total = await db.column.count({ where: { projectId: id } });
    if (total <= 1) {
      return forbidden("A board must keep at least one column.");
    }

    // Cascades to the column's tasks (and their comments).
    await db.column.delete({ where: { id: columnId } });

    await logProjectEvent({
      projectId: id,
      actorId: user.id,
      type: "column.deleted",
      payload: { columnId, columnName: existing.name }
    });

    return ok({ deleted: true });
  } catch (error) {
    return serverError(error, "DELETE /api/projects/:id/columns/:columnId");
  }
}