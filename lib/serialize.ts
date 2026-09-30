import type {
  ActivityDTO,
  CommentDTO,
  MemberDTO,
  NotificationDTO,
  Priority,
  ProjectSummaryDTO,
  Role,
  TaskDTO,
  UserDTO
} from "./types";

/**
 * Row → DTO mappers.
 *
 * The shapes are structural (not Prisma's generated types) so these functions
 * are the one definition of what a task, comment or notification looks like over
 * the wire — shared by REST handlers, the gateway and the SSE fallback.
 * Dates always leave as ISO strings.
 */

export type UserRow = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarUrl?: string | null;
};

export type TaskRow = {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: string;
  position: number;
  dueDate: Date | null;
  completedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  assignee?: UserRow | null;
  creator?: UserRow | null;
  _count?: { comments: number };
};

export type CommentRow = {
  id: string;
  taskId: string;
  body: string;
  createdAt: Date;
  author: UserRow;
};

export type NotificationRow = {
  seq: number;
  type: string;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
  projectId: string | null;
  taskId: string | null;
};

export type EventRow = {
  seq: number;
  type: string;
  actorId: string;
  payload: string;
  createdAt: Date;
};

export function toUserDTO(row: UserRow): UserDTO {
  return { id: row.id, name: row.name, email: row.email, avatarColor: row.avatarColor, avatarUrl: row.avatarUrl ?? null };
}

export function toMemberDTO(row: UserRow & { role: string; joinedAt: Date }): MemberDTO {
  return { ...toUserDTO(row), role: row.role as Role, joinedAt: row.joinedAt.toISOString() };
}

export function toTaskDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    columnId: row.columnId,
    title: row.title,
    description: row.description,
    priority: (row.priority as Priority) ?? "medium",
    position: row.position,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assignee: row.assignee ? toUserDTO(row.assignee) : null,
    creator: row.creator ? toUserDTO(row.creator) : null,
    commentCount: row._count?.comments ?? 0
  };
}

export function toCommentDTO(row: CommentRow): CommentDTO {
  return {
    id: row.id,
    taskId: row.taskId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: toUserDTO(row.author)
  };
}

export function toNotificationDTO(row: NotificationRow, actor?: UserRow | null): NotificationDTO {
  return {
    seq: row.seq,
    type: row.type as NotificationDTO["type"],
    title: row.title,
    body: row.body,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    projectId: row.projectId,
    taskId: row.taskId,
    actor: actor ? toUserDTO(actor) : null
  };
}

export function toActivityDTO(row: EventRow, actor?: UserRow | null): ActivityDTO {
  return {
    seq: row.seq,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
    actor: actor ? toUserDTO(actor) : null,
    summary: summarizeEvent(row.type, row.payload)
  };
}

export function toProjectSummaryDTO(row: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
  createdAt: Date;
  role: string;
  memberCount: number;
  taskCount: number;
  doneCount: number;
}): ProjectSummaryDTO {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    color: row.color,
    role: row.role as Role,
    memberCount: row.memberCount,
    taskCount: row.taskCount,
    doneCount: row.doneCount,
    createdAt: row.createdAt.toISOString()
  };
}

/** Human sentence for the activity feed — derived from the event payload. */
export function summarizeEvent(type: string, rawPayload: string): string {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : "a task";
  const column = typeof payload.columnName === "string" ? payload.columnName : "a column";
  const assignee = typeof payload.assigneeName === "string" ? payload.assigneeName : null;
  const memberName = typeof payload.memberName === "string" ? payload.memberName : "a member";

  switch (type) {
    case "task.created":
      return `created “${title}”`;
    case "task.moved":
      return `moved “${title}” to ${column}`;
    case "task.updated":
      return assignee ? `assigned “${title}” to ${assignee}` : `updated “${title}”`;
    case "task.deleted":
      return `deleted “${title}”`;
    case "comment.created":
      return `commented on “${title}”`;
    case "comment.deleted":
      return `removed a comment on “${title}”`;
    case "column.created":
      return `added the column ${column}`;
    case "column.updated":
      return `renamed a column to ${column}`;
    case "column.deleted":
      return `removed the column ${column}`;
    case "member.added":
      return `added ${memberName} to the project`;
    case "member.removed":
      return `removed ${memberName} from the project`;
    case "project.updated":
      return "updated the project details";
    default:
      return type.replace(/\./g, " ");
  }
}

/** New cards land at the bottom of a column. */
export function nextPosition(lastPosition: number | null | undefined): number {
  return (lastPosition ?? 0) + 1024;
}

/** Midpoint between two neighbours, used when dropping a card between cards. */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1024;
  if (before === null) return (after as number) / 2;
  if (after === null) return before + 1024;
  return (before + after) / 2;
}