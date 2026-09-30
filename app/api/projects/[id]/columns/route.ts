import { db } from "../../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../../lib/auth/guards";
import { fail, forbidden, ok, parseBody, serverError, unauthorized } from "../../../../../lib/http";
import { columnCreateSchema } from "../../../../../lib/validation";
import { logProjectEvent } from "../../../../../lib/realtime/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/projects/:id/columns — add a column (admin)
 *
 * Columns are the shape of the workflow, so changing them is an admin action
 * rather than something any member can do by accident.
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
    if (access.role === "member") {
      return forbidden("Only project admins can change the board columns.");
    }

    const parsed = await parseBody(request, columnCreateSchema);
    if (!parsed.ok) return parsed.response;

    const count = await db.column.count({ where: { projectId: id } });
    if (count >= 12) {
      return fail("A board can have at most 12 columns.", 422, { code: "limit" });
    }

    const last = await db.column.findFirst({
      where: { projectId: id },
      orderBy: { position: "desc" },
      select: { position: true }
    });

    const column = await db.column.create({
      data: {
        projectId: id,
        name: parsed.data.name,
        position: (last?.position ?? 0) + 1024
      }
    });

    await logProjectEvent({
      projectId: id,
      actorId: user.id,
      type: "column.created",
      payload: { columnName: column.name, columnId: column.id, position: column.position }
    });

    return ok(
      {
        column: {
          id: column.id,
          name: column.name,
          position: column.position,
          isDone: column.isDone
        }
      },
      201
    );
  } catch (error) {
    return serverError(error, "POST /api/projects/:id/columns");
  }
}