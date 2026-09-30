import "./server/polyfill";
import "./server/env";

import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import { Socket } from "node:net";
import next from "next";
import { RealtimeGateway } from "./server/realtime";
import { registerRealtime } from "./lib/realtime/registry";

/**
 * Fonia Projects — custom Next.js server.
 *
 * Why a custom server at all? Because the realtime gateway and the app must
 * share one origin, one cookie jar and one process, so `npm run dev` starts
 * everything and nothing has to be hosted separately:
 *
 *   http://localhost:3000        → Next.js (App Router)
 *   ws://localhost:3000/api/realtime → hand-written WebSocket gateway
 *
 * Next's docs explicitly support this ("Custom Server") — we pass the http
 * server to `next()` so Turbopack/HMR in dev and the production build both work.
 */

const dev = !process.argv.includes("--prod") && process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "localhost";

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer: HttpServer = createServer((req, res) => {
    // Sockets, SSE and page requests all flow through Next here. The gateway
    // handles upgrades before this handler ever sees them.
    void handle(req, res);
  });

  const gateway = new RealtimeGateway();
  gateway.attach(httpServer);

  // Let route handlers reach the one live gateway for presence and statistics.
  registerRealtime({
    path: gateway.path,
    presence: (projectId: string) => gateway.presenceFor(projectId),
    stats: () => gateway.stats as unknown as Record<string, unknown>
  });

  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`\n  ✗ Port ${port} is already in use. Stop the other process or run: $env:PORT=3001; npm run dev\n`);
    } else {
      console.error("Server error:", error);
    }
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log(`\n  ▲ Fonia Projects — a Fonia Labs Product`);
    console.log(`  → App      http://${hostname}:${port}`);
    console.log(`  → Realtime ws://${hostname}:${port}${gateway.path}  (${dev ? "development" : "production"})`);
    console.log(`  → Gateway  ${gateway.stats.subscribers} bus subscriber(s)\n`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n  ${signal} received — closing connections…`);
    gateway.close();
    httpServer.close(() => process.exit(0));
    // Never hang forever waiting for a stuck socket.
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

/** Used by the gateway to type its own upgrade callback. */
export type UpgradeRequest = IncomingMessage & { socket: Socket };

main().catch((error) => {
  console.error("Failed to start the Fonia Projects server:", error);
  process.exit(1);
});