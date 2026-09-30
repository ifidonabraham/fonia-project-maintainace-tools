import { db } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth/guards";
import { ok, parseBody, serverError, unauthorized } from "../../../lib/http";
import { notificationReadSchema } from "../../../lib/validation";
import { toNotificationDTO } from "../../../lib/serialize";
import { markNotificationsRead, unreadCount } from "../../../lib/realtime/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET   /api/notifications — recent notifications + unread total for the bell
 * PATCH /api/notifications — mark all (or specific) notifications as read
 */

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50") || 50, 100);
    const unreadOnly = url.searchParams.get("unread") === "1";

    const rows = await db.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { seq: "desc" },
      take: limit
    });

    // Actors are loaded in one query rather than per notification.
    const actorIds = Array.from(
      new Set(rows.map((row) => row.actorId).filter((value): value is string => Boolean(value)))
    );
    const actors = actorIds.length
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true }
        })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    return ok({
      notifications: rows.map((row) =>
        toNotificationDTO(row, row.actorId ? actorById.get(row.actorId) ?? null : null)
      ),
      unreadCount: await unreadCount(user.id)
    });
  } catch (error) {
    return serverError(error, "GET /api/notifications");
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const parsed = await parseBody(request, notificationReadSchema);
    if (!parsed.ok) return parsed.response;

    const updated = await markNotificationsRead(user.id, parsed.data.seqs);

    return ok({ updated, unreadCount: await unreadCount(user.id) });
  } catch (error) {
    return serverError(error, "PATCH /api/notifications");
  }
}