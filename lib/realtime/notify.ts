import { db } from "../db";
import { toNotificationDTO, type NotificationRow, type UserRow } from "../serialize";
import type { NotificationDTO, NotificationType, UserFrame } from "../types";
import { publishToUser } from "./bus";

/**
 * Notification fan-out.
 *
 * The rules live in one place so "why did I get this?" always has an answer:
 *
 *   task.assigned      → the new assignee
 *   comment.mention    → every @mentioned member
 *   comment.reply      → the assignee + the task creator (minus the author)
 *   project.added      → the member who was added
 *   task.done          → the task creator + assignee (minus whoever moved it)
 *   task.due_soon      → the assignee (swept by /api/cron/due-soon)
 *
 * A user is never notified about their own action.
 */

export type NotifyInput = {
  userId: string;
  actorId: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  projectId?: string | null;
  taskId?: string | null;
};

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function notify(input: NotifyInput): Promise<NotificationDTO | null> {
  // Never notify someone about something they just did themselves.
  if (input.actorId && input.actorId === input.userId) return null;

  const row = await db.notification.create({
    data: {
      userId: input.userId,
      actorId: input.actorId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null
    }
  });

  const actor = input.actorId ? await loadActor(input.actorId) : null;
  const dto = toNotificationDTO(row as NotificationRow, actor);
  const unread = await unreadCount(input.userId);

  publishToUser(input.userId, {
    channel: "user",
    seq: row.seq,
    kind: "notification",
    notification: dto,
    unreadCount: unread
  });

  return dto;
}

/** Fan out the same notification to several recipients, de-duplicated. */
export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, "userId">
): Promise<number> {
  const unique = Array.from(new Set(userIds)).filter((id) => id && id !== input.actorId);
  let created = 0;
  for (const userId of unique) {
    const notification = await notify({ ...input, userId });
    if (notification) created += 1;
  }
  return created;
}

export async function markNotificationsRead(
  userId: string,
  seqs?: number[]
): Promise<number> {
  const result = await db.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(seqs && seqs.length > 0 ? { seq: { in: seqs } } : {})
    },
    data: { readAt: new Date() }
  });

  if (result.count > 0) {
    const unread = await unreadCount(userId);
    publishToUser(userId, { channel: "user", seq: 0, kind: "presence", unreadCount: unread });
  }

  return result.count;
}

/** Tell a user their access to a project changed, so the UI can react instantly. */
export async function publishAccessChange(
  userId: string,
  projectId: string,
  action: "added" | "removed" | "role"
): Promise<void> {
  const frame: UserFrame = {
    channel: "user",
    seq: 0,
    kind: "access",
    projectId,
    action,
    unreadCount: await unreadCount(userId)
  };
  publishToUser(userId, frame);
}

/**
 * Mention parsing.
 *
 * `@ana` matches a member whose first name, full name slug or email local part
 * matches (case-insensitive), so both "@ana" and "@ana.lopez" work.
 */
export function extractMentions(body: string): string[] {
  const handles = new Set<string>();
  const pattern = /@([a-zA-Z0-9._-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}

export function resolveMentions(
  body: string,
  members: { id: string; name: string; email: string }[]
): string[] {
  const handles = extractMentions(body);
  if (handles.length === 0) return [];

  const matched = new Set<string>();
  for (const member of members) {
    const firstName = member.name.split(" ")[0].toLowerCase();
    const fullSlug = member.name.toLowerCase().replace(/\s+/g, ".");
    const localPart = member.email.split("@")[0].toLowerCase();

    if (handles.includes(firstName) || handles.includes(fullSlug) || handles.includes(localPart)) {
      matched.add(member.id);
    }
  }
  return Array.from(matched);
}

async function loadActor(actorId: string): Promise<UserRow | null> {
  return db.user.findUnique({
    where: { id: actorId },
    select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true }
  });
}