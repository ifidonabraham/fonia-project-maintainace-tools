/**
 * Shared type contract between the server (REST + realtime gateway) and the client.
 * Everything the browser receives over the wire is described here, so a change to
 * a payload is a type error in both places instead of a runtime surprise.
 */

export type Role = "owner" | "admin" | "member";
export type Priority = "low" | "medium" | "high" | "urgent";

/** Event names published to project rooms and replayed on reconnect. */
export type ProjectEventType =
  | "task.created"
  | "task.updated"
  | "task.moved"
  | "task.deleted"
  | "comment.created"
  | "comment.deleted"
  | "column.created"
  | "column.updated"
  | "column.deleted"
  | "member.added"
  | "member.removed"
  | "project.updated"
  | "project.deleted"
  | "presence.sync"
  | "typing.start"
  | "typing.stop";

/** Notification kinds — each maps to one fan-out rule in the server. */
export type NotificationType =
  | "task.assigned"
  | "task.unassigned"
  | "comment.mention"
  | "comment.reply"
  | "project.added"
  | "task.done"
  | "task.due_soon"
  | "project.updated";

/** Connection state surfaced in the UI so users always know their board is live. */
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline";

export type UserDTO = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarUrl: string | null;
};

export type MemberDTO = UserDTO & {
  role: Role;
  joinedAt: string;
};

export type ColumnDTO = {
  id: string;
  name: string;
  position: number;
  isDone: boolean;
  taskCount?: number;
};

export type TaskDTO = {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: Priority;
  position: number;
  dueDate: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  assignee: UserDTO | null;
  creator: UserDTO | null;
  commentCount: number;
};

export type CommentDTO = {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  author: UserDTO;
};

export type ProjectSummaryDTO = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
  role: Role;
  memberCount: number;
  taskCount: number;
  doneCount: number;
  createdAt: string;
};

export type ProjectDetailDTO = ProjectSummaryDTO & {
  members: MemberDTO[];
};

export type ActivityDTO = {
  seq: number;
  type: ProjectEventType | string;
  createdAt: string;
  actor: UserDTO | null;
  summary: string;
};

export type NotificationDTO = {
  seq: number;
  type: NotificationType;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  projectId: string | null;
  taskId: string | null;
  actor: UserDTO | null;
};

/** A user who currently has the board open — driven by the gateway's presence map. */
export type PresenceUser = UserDTO & { connectionCount: number };

/** Project-room frame: `event` is the log entry, replayed frames arrive with `replay: true`. */
export type ProjectFrame = {
  channel: "project";
  projectId: string;
  seq: number;
  event: {
    seq: number;
    type: string;
    actorId: string;
    payload: Record<string, unknown>;
    createdAt: string;
  };
  replay?: boolean;
};

/** User-room frame: new notification, unread total, or an access change. */
export type UserFrame = {
  channel: "user";
  seq: number;
  kind: "notification" | "presence" | "access";
  notification?: NotificationDTO;
  unreadCount?: number;
  projectId?: string;
  action?: "added" | "removed" | "role";
  presence?: PresenceUser[];
  projectIdForPresence?: string;
};

export type Frame =
  | { type: "hello"; userId: string; projects: string[]; seq: number }
  | ProjectFrame
  | UserFrame
  | { type: "pong"; t: number }
  | { type: "error"; message: string };

/** Client → server frames. */
export type ClientFrame =
  | { type: "subscribe"; projectId: string; since?: number }
  | { type: "unsubscribe"; projectId: string }
  | { type: "heartbeat"; t: number }
  | { type: "presence"; projectId: string }
  | { type: "typing"; projectId: string; taskId: string | null; state: "start" | "stop" };

/** Every REST handler returns one of these envelopes. */
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; code?: string; fields?: Record<string, string>; current?: unknown };
export type ApiResponse<T> = ApiOk<T> | ApiErr;