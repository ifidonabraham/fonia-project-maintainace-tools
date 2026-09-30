import { db } from "../db";
import { getProjectAccess } from "../auth/guards";
import {
  toActivityDTO,
  toMemberDTO,
  toProjectSummaryDTO,
  toTaskDTO
} from "../serialize";
import { presenceFor } from "../realtime/registry";
import type {
  ActivityDTO,
  ColumnDTO,
  MemberDTO,
  ProjectSummaryDTO,
  Role,
  TaskDTO,
  PresenceUser
} from "../types";

/**
 * Board payload.
 *
 * One function, used by both the board page (server-rendered first paint) and
 * GET /api/projects/:id/board (client refreshes). Keeping them on the same code
 * path means the page and the API can never drift apart.
 */

export type BoardPayload = {
  project: ProjectSummaryDTO;
  columns: ColumnDTO[];
  members: MemberDTO[];
  tasks: TaskDTO[];
  activity: ActivityDTO[];
  presence: PresenceUser[];
  /** Cursor for the realtime client: the newest event already reflected above. */
  seq: number;
};

export async function loadBoard(
  userId: string,
  projectId: string
): Promise<BoardPayload | null> {
  const access = await getProjectAccess(userId, projectId);
  if (!access) return null;

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        orderBy: { joinedAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } } }
      },
      columns: { orderBy: { position: "asc" } }
    }
  });
  if (!project) return null;

  const tasks = await db.task.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } },
      _count: { select: { comments: true } }
    }
  });

  const events = await db.projectEvent.findMany({
    where: { projectId },
    orderBy: { seq: "desc" },
    take: 30,
    include: { actor: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true } } }
  });

  const doneColumnIds = new Set(
    project.columns.filter((column) => column.isDone).map((column) => column.id)
  );
  const doneCount = tasks.filter((task) => doneColumnIds.has(task.columnId)).length;

  return {
    project: toProjectSummaryDTO({
      id: project.id,
      key: project.key,
      name: project.name,
      description: project.description,
      color: project.color,
      createdAt: project.createdAt,
      role: access.role as Role,
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
    presence: presenceFor(projectId),
    seq: events[0]?.seq ?? 0
  };
}