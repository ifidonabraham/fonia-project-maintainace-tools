import { db } from "../../../lib/db";
import { getCurrentUser, projectIdsForUser } from "../../../lib/auth/guards";
import { fail, ok, parseBody, serverError, unauthorized } from "../../../lib/http";
import { projectCreateSchema } from "../../../lib/validation";
import { DEFAULT_COLUMNS, PROJECT_COLORS, pickAvatarColor } from "../../../lib/constants";
import { toProjectSummaryDTO } from "../../../lib/serialize";
import { notify } from "../../../lib/realtime/notify";
import { publishAccessChange } from "../../../lib/realtime/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET  /api/projects — every project the signed-in user belongs to, with counts
 * POST /api/projects — create a project (creator becomes owner)
 */

export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const memberships = await db.projectMember.findMany({
      where: { userId: user.id, project: { archivedAt: null } },
      orderBy: { joinedAt: "desc" },
      include: {
        project: {
          include: {
            _count: { select: { members: true, tasks: true } }
          }
        }
      }
    });

    const projectIds = memberships.map((row) => row.projectId);

    // "Done" depends on the column, not the task, so count tasks per done column.
    const doneColumns = projectIds.length
      ? await db.column.findMany({
          where: { projectId: { in: projectIds }, isDone: true },
          select: { id: true, projectId: true }
        })
      : [];

    const doneCounts = new Map<string, number>();
    if (doneColumns.length > 0) {
      const grouped = await db.task.groupBy({
        by: ["projectId"],
        where: { columnId: { in: doneColumns.map((column) => column.id) } },
        _count: { _all: true }
      });
      for (const row of grouped) doneCounts.set(row.projectId, row._count._all);
    }

    const projects = memberships.map((row) =>
      toProjectSummaryDTO({
        id: row.project.id,
        key: row.project.key,
        name: row.project.name,
        description: row.project.description,
        color: row.project.color,
        createdAt: row.project.createdAt,
        role: row.role,
        memberCount: row.project._count.members,
        taskCount: row.project._count.tasks,
        doneCount: doneCounts.get(row.projectId) ?? 0
      })
    );

    return ok({ projects });
  } catch (error) {
    return serverError(error, "GET /api/projects");
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const parsed = await parseBody(request, projectCreateSchema);
    if (!parsed.ok) return parsed.response;

    const key = parsed.data.key.toUpperCase();
    const name = parsed.data.name;
    const description = parsed.data.description?.trim() || null;
    const color =
      parsed.data.color ||
      PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];

    const keyTaken = await db.project.findUnique({ where: { key }, select: { id: true } });
    if (keyTaken) {
      return fail("That project key is already in use.", 409, {
        code: "key_taken",
        fields: { key: `“${key}” is taken — try another short key.` }
      });
    }

    const invitedEmails = Array.from(
      new Set((parsed.data.memberEmails ?? []).map((email) => email.toLowerCase()))
    ).filter((email) => email !== user.email);

    // Only existing accounts can be added — this tool has no email delivery, so
    // an invite link to a stranger would be a promise it cannot keep.
    const invitees = invitedEmails.length
      ? await db.user.findMany({
          where: { email: { in: invitedEmails } },
          select: { id: true, name: true, email: true }
        })
      : [];

    const project = await db.project.create({
      data: {
        key,
        name,
        description,
        color,
        createdById: user.id,
        members: {
          create: [
            { userId: user.id, role: "owner" },
            ...invitees.map((invitee) => ({ userId: invitee.id, role: "member" }))
          ]
        },
        columns: {
          create: DEFAULT_COLUMNS.map((column, index) => ({
            name: column.name,
            isDone: column.isDone,
            position: (index + 1) * 1024
          }))
        }
      }
    });

    // Tell each invitee, live, that they now have a new board.
    for (const invitee of invitees) {
      await notify({
        userId: invitee.id,
        actorId: user.id,
        type: "project.added",
        title: `${user.name} added you to “${project.name}”`,
        body: "Open the board to see what is on the go.",
        projectId: project.id
      });
      await publishAccessChange(invitee.id, project.id, "added");
    }

    return ok(
      {
        project: toProjectSummaryDTO({
          id: project.id,
          key: project.key,
          name: project.name,
          description: project.description,
          color: project.color,
          createdAt: project.createdAt,
          role: "owner",
          memberCount: invitees.length + 1,
          taskCount: 0,
          doneCount: 0
        }),
        invited: invitees.length,
        unknownEmails: invitedEmails.filter(
          (email) => !invitees.some((invitee) => invitee.email === email)
        )
      },
      201
    );
  } catch (error) {
    return serverError(error, "POST /api/projects");
  }
}