import { REALTIME_PATH } from "../../../../lib/constants";
import { bus } from "../../../../lib/realtime/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Realtime diagnostics.
 *
 * Because the gateway shares this process, the bus counters it publishes to are
 * readable right here — a tiny "is realtime actually alive?" endpoint for
 * debugging, the way you would check a health check before blaming the client.
 */
export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    data: {
      path: REALTIME_PATH,
      transport: "websocket",
      fallback: `${REALTIME_PATH}/stream`,
      bus: bus.stats,
      node: process.version,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime())
    }
  });
}