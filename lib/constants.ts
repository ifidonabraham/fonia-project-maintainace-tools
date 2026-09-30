import type { Priority, Role } from "./types";

/** Columns every new project starts with — a familiar Trello-style pipeline. */
export const DEFAULT_COLUMNS: { name: string; isDone: boolean }[] = [
  { name: "Backlog", isDone: false },
  { name: "In Progress", isDone: false },
  { name: "In Review", isDone: false },
  { name: "Done", isDone: true }
];

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
};

export const ROLES: Role[] = ["owner", "admin", "member"];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member"
};

/** Only owners/admins may reshape the project or its membership. */
export function roleCanManage(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/** Members can work the board; only owners can delete the project. */
export function roleCanEdit(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as string[]).includes(value);
}

/** Avatar palette — pulled from the Fonia Labs brand ramp. */
export const AVATAR_COLORS = [
  "#38bdf8",
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#2dd4bf",
  "#fb923c"
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Project accent colors users can pick when creating a project. */
export const PROJECT_COLORS = [
  "#38bdf8",
  "#2563eb",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf"
];

export const LIMITS = {
  name: 80,
  email: 160,
  password: 12,
  projectName: 80,
  projectKey: 6,
  description: 600,
  taskTitle: 140,
  taskDescription: 2000,
  comment: 2000,
  columnName: 40
};

export const SESSION_COOKIE = process.env.SESSION_COOKIE || "fonia_projects_session";
export const REALTIME_PATH = process.env.REALTIME_PATH || "/api/realtime";

/** Minutes before a due date that a `task.due_soon` notification fires. */
export const DUE_SOON_WINDOW_MINUTES = 24 * 60;