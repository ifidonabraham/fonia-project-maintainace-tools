import { db } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth/session";
import { bus, type BusMessage } from "../../../../lib/realtime/bus";
import { eventsSince } from "../../../../lib/realtime/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events fallback for realtime.
 *
 * The WebSocket gateway is the primary transport, but a board that silently
 * stops updating is worse than one that updates with slightly less precision —
 * so the client falls back to this stream if the socket cannot be opened (a
 * proxy that strips Upgrade headers, a corporate network, a browser extension).
 *
 * SSE is a strictly worse transport: it is one-directional, so typing and
 * presence simply do not happen here, and it consumes a request slot per client.
 * That is exactly why WebSocket is the default.
 */
const KEEPALIVE_INTERVAL_MS = 20_000;

export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true }
  });
  if (!user) return new Response("Unauthorized", { status: 401 });

  const memberships = await db.projectMember.findMany({
    where: { userId: user.id },
    select: { projectId: true }
  });
  const projectIds = new Set(memberships.map((row) => row.projectId));

  // Replay anything the client missed before the stream opens.
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? "0");
  const backlog = Number.isFinite(since) ? await eventsSince(Array.from(projectIds), since) : [];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const write = (payload: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      };

      const send = (frame: unknown) => {
        write(`data: ${JSON.stringify(frame)}\n\n`);
      };

      send({ type: "hello", transport: "sse", userId: user.id, projects: Array.from(projectIds) });
      for (const frame of backlog) send(frame);

      // Bridge the same bus the WebSocket gateway listens on.
      const unsubscribe = bus.subscribe((message: BusMessage) => {
        const allowed =
          message.channel === "project"
            ? projectIds.has(message.target)
            : message.target === user.id;
        if (!allowed) return;

        // Drop frames instead of buffering without bound for a stalled client.
        if (controller.desiredSize !== null && controller.desiredSize <= 0) return;
        send(message.payload);
      });

      const keepalive = setInterval(() => write(": keepalive\n\n"), KEEPALIVE_INTERVAL_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}