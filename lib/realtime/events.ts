import { db } from "../db";
import type { ProjectFrame, ProjectEventType } from "../types";
import { publishToProject } from "./bus";

/**
 * The realtime event log.
 *
 * Every meaningful write appends one row to `ProjectEvent` and then publishes a
 * frame. Two properties fall out of that ordering:
 *
 *  1. emit-after-commit — we never tell a client about a change the database
 *     does not have, so a reconnecting client cannot "lose" a write.
 *  2. replayable — `seq` is a global autoincrement counter, so a client that was
 *     offline for a minute can ask for everything after its last seq and catch
 *     up exactly, with no gaps and no duplicates.
 */

export type LogEventInput = {
  projectId: string;
  actorId: string;
  type: ProjectEventType;
  payload: Record<string, unknown>;
};

export async function logProjectEvent(input: LogEventInput): Promise<ProjectFrame> {
  const row = await db.projectEvent.create({
    data: {
      projectId: input.projectId,
      actorId: input.actorId,
      type: input.type,
      payload: JSON.stringify(input.payload)
    }
  });

  const frame: ProjectFrame = {
    channel: "project",
    projectId: input.projectId,
    seq: row.seq,
    event: {
      seq: row.seq,
      type: row.type,
      actorId: row.actorId,
      payload: input.payload,
      createdAt: row.createdAt.toISOString()
    }
  };

  publishToProject(input.projectId, frame);
  return frame;
}

/**
 * Catch-up query for reconnects — everything a client missed in its rooms.
 * Capped so a client that returns after a month cannot be handed megabytes.
 */
export async function eventsSince(
  projectIds: string[],
  since: number,
  limit = 500
): Promise<ProjectFrame[]> {
  if (projectIds.length === 0) return [];

  const rows = await db.projectEvent.findMany({
    where: { projectId: { in: projectIds }, seq: { gt: since } },
    orderBy: { seq: "asc" },
    take: limit
  });

  return rows.map((row) => ({
    channel: "project" as const,
    projectId: row.projectId,
    seq: row.seq,
    replay: true,
    event: {
      seq: row.seq,
      type: row.type,
      actorId: row.actorId,
      payload: safeJson(row.payload),
      createdAt: row.createdAt.toISOString()
    }
  }));
}

/** Highest seq currently in the log (used for the `hello` frame). */
export async function latestSeq(): Promise<number> {
  const row = await db.projectEvent.findFirst({
    orderBy: { seq: "desc" },
    select: { seq: true }
  });
  return row?.seq ?? 0;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}