import { redirect } from "next/navigation";
import { db } from "../db";
import type { Role, UserDTO } from "../types";
import { roleCanManage } from "../constants";
import { getSession } from "./session";

/**
 * Authorization helpers.
 *
 * Every read and write goes through one of these, on the server. The UI also
 * hides what a user cannot do, but hiding a button is never the security
 * boundary — these functions are.
 */

export function toUserDTO(user: {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarUrl?: string | null;
}): UserDTO {
  return { id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl ?? null };
}

/** Resolve the signed-in user, or null. Never throws for an anonymous visitor. */
export async function getCurrentUser(): Promise<UserDTO | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true }
  });

  return user ? toUserDTO(user) : null;
}

/** For Server Components: bounce anonymous visitors to the sign-in page. */
export async function requireUser(nextPath?: string): Promise<UserDTO> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

export type Access = { role: Role; projectId: string };

export async function getProjectAccess(
  userId: string,
  projectId: string
): Promise<Access | null> {
  const membership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true }
  });
  if (!membership) return null;
  return { role: membership.role as Role, projectId };
}

/** True when the user may read the project. */
export async function canReadProject(userId: string, projectId: string): Promise<boolean> {
  return (await getProjectAccess(userId, projectId)) !== null;
}

/** True when the user may create/move/edit tasks and comments. */
export async function canWriteProject(userId: string, projectId: string): Promise<boolean> {
  return (await getProjectAccess(userId, projectId)) !== null;
}

/** True when the user may rename the project, manage columns or members. */
export async function canManageProject(userId: string, projectId: string): Promise<boolean> {
  const access = await getProjectAccess(userId, projectId);
  return access !== null && roleCanManage(access.role);
}

/** The project ids a user belongs to — used to authorize socket rooms. */
export async function projectIdsForUser(userId: string): Promise<string[]> {
  const rows = await db.projectMember.findMany({
    where: { userId },
    select: { projectId: true }
  });
  return rows.map((row) => row.projectId);
}

/** Resolve an email address to a user (used when adding project members). */
export async function findUserByEmail(email: string) {
  return db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true }
  });
}