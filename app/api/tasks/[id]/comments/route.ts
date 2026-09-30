import { db } from "../../../../../lib/db";
import { getCurrentUser, getProjectAccess } from "../../../../../lib/auth/guards";
import { forbidden, notFound, ok, parseBody, serverError, unauthorized } from "../../../../../lib/http";
import { commentCreateSchema } from "../../../../../lib/validation";
import { logProjectEvent } from "../../../../../lib/realtime/events";
import { notify, notifyMany, resolveMentions } from "../../../../../lib/realtime/notify";
import { toCommentDTO, toTaskDTO } from "../../../../../lib/serialize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET  /api/tasks/:id/comments — the thread, oldest first
 * POST /api/tasks/:id/comments — add a comment
 *
 * Two notification rules apply here and they are deliberately different:
 *   · an @mention notifies exactly the people named;
 *   · otherwise the task's assignee and creator are told a reply arrived.
 * Nobody is ever notified about their own comment.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const task = await db.task.findUnique({ where: { id }, select: { projectId: true } });
    if (!task) return notFound("Task");

    const access = await getProjectAccess(user.id, task.projectId);
    if (!access) return forbidden("You are not a member of this project.");

    const comments = await db.comment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } } }
    });

    return ok({ comments: comments.map(toCommentDTO) });
  } catch (error) {
    return serverError(error, "GET /api/tasks/:id/comments");
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
    const task = await db.task.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
        title: true,
        assigneeId: true,
        createdById: true
      }
    });
    if (!task) return notFound("Task");

    const access = await getProjectAccess(user.id, task.projectId);
    if (!access) return forbidden("You are not a member of this project.");

    const parsed = await parseBody(request, commentCreateSchema);
    if (!parsed.ok) return parsed.response;

    const comment = await db.comment.create({
      data: { taskId: id, authorId: user.id, body: parsed.data.body },
      include: { author: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } } }
    });

    const dto = toCommentDTO(comment);
    const full = await db.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        creator: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
        _count: { select: { comments: true } }
      }
    });

    await logProjectEvent({
      projectId: task.projectId,
      actorId: user.id,
      type: "comment.created",
      payload: {
        taskId: task.id,
        title: task.title,
        comment: dto,
        commentCount: full ? toTaskDTO(full).commentCount : undefined
      }
    });

    const members = await db.projectMember.findMany({
      where: { projectId: task.projectId },
      select: { user: { select: { id: true, name: true, email: true } } }
    });
    const mentionIds = resolveMentions(parsed.data.body, members.map((row) => row.user));

    if (mentionIds.length > 0) {
      await notifyMany(mentionIds, {
        actorId: user.id,
        type: "comment.mention",
        title: `${user.name} mentioned you on “${task.title}”`,
        body: parsed.data.body.slice(0, 140),
        projectId: task.projectId,
        taskId: task.id
      });
    } else {
      const recipients = [task.assigneeId, task.createdById].filter(
        (value): value is string => Boolean(value)
      );
      for (const recipient of Array.from(new Set(recipients))) {
        await notify({
          userId: recipient,
          actorId: user.id,
          type: "comment.reply",
          title: `${user.name} commented on “${task.title}”`,
          body: parsed.data.body.slice(0, 140),
          projectId: task.projectId,
          taskId: task.id
        });
      }
    }

    return ok({ comment: dto }, 201);
  } catch (error) {
    return serverError(error, "POST /api/tasks/:id/comments");
  }
}