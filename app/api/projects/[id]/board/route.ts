import { db } from "../../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../../lib/auth/guards";
import { forbidden, notFound, ok, serverError, unauthorized } from "../../../../../lib/http";
import { toActivityDTO, toMemberDTO, toProjectSummaryDTO, toTaskDTO } from "../../../../../lib/serialize";
import { presenceFor } from "../../../../../lib/realtime/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/projects/:id/board
 *
 * One round trip for everything the board needs: the project, its columns,
 * tasks, members, a slice of activity and who is currently viewing. The `seq`
 * it returns is the cursor the realtime client hands back on reconnect, so the
 * board can pick up exactly where it left off instead of reloading.
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

    const project = await db.project.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { joinedAt: "asc" },
          include: {
            user: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } }
          }
        },
        columns: { orderBy: { position: "asc" } }
      }
    });
    if (!project) return notFound("Project");

    const tasks = await db.task.findMany({
      where: { projectId: id },
      orderBy: { position: "asc" },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        _count: { select: { comments: true } }
      }
    });

    const events = await db.projectEvent.findMany({
      where: { projectId: id },
      orderBy: { seq: "desc" },
      take: 30,
      include: {
        actor: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } }
      }
    });

    const doneColumnIds = new Set(project.columns.filter((column) => column.isDone).map((c) => c.id));
    const doneCount = tasks.filter((task) => doneColumnIds.has(task.columnId)).length;

    return ok({
      project: toProjectSummaryDTO({
        id: project.id,
        key: project.key,
        name: project.name,
        description: project.description,
        color: project.color,
        createdAt: project.createdAt,
        role: access.role,
        memberCount: project.members.length,
        taskCount: tasks.length,
        doneCount
      }),
      columns: project.columns.map((column) => ({
        id: column.id,
        name: column.name,
        position: column.position,
        isDone: column.isDone
      })),
      members: project.members.map((member) =>
        toMemberDTO({
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          avatarColor: member.user.avatarColor,
          role: member.role,
          joinedAt: member.joinedAt
        })
      ),
      tasks: tasks.map(toTaskDTO),
      activity: events.map((event) =>
        toActivityDTO(
          {
            seq: event.seq,
            type: event.type,
            actorId: event.actorId,
            payload: event.payload,
            createdAt: event.createdAt
          },
          event.actor
        )
      ),
      presence: presenceFor(project.id),
      /** Reconnect cursor — the newest event already reflected above. */
      seq: events[0]?.seq ?? 0
    });
  } catch (error) {
    return serverError(error, "GET /api/projects/:id/board");
  }
}