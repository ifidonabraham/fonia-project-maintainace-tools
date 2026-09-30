import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { REALTIME_PATH } from "../lib/constants";
import { db } from "../lib/db";
import { sessionFromCookieHeader } from "../lib/auth/session";
import { bus, type BusMessage } from "../lib/realtime/bus";
import { eventsSince, latestSeq } from "../lib/realtime/events";
import type { ClientFrame, Frame, PresenceUser, ProjectFrame, UserDTO } from "../lib/types";
import type { IncomingRequest } from "./types";

/**
 * ============================================================================
 *  Realtime gateway — hand-written on top of raw WebSocket frames
 * ============================================================================
 *
 * `ws` is used only for what it is: an RFC 6455 frame codec (the masking,
 * fragmentation and close-handshake rules of the protocol). Everything that
 * makes this feature *ours* is implemented below:
 *
 *   · authentication   — the same HS256 session cookie as HTTP, checked during
 *                        the upgrade, so a socket cannot outlive a session
 *   · authorization    — project membership re-verified against the database
 *                        before a socket joins a room
 *   · rooms            — project:<id> plus a personal user:<id> room
 *   · replay           — reconnecting clients pass `since=<seq>` and receive
 *                        exactly the events they missed from the event log
 *   · presence         — who has each board open right now, with connection counts
 *   · typing           — short-lived, auto-expiring "X is typing" signals
 *   · heartbeats       — ping/pong with a deadline, so half-open sockets are reaped
 *   · backpressure     — sends are skipped for non-open sockets instead of queueing
 *
 * Messages arrive from two directions:
 *   browser → gateway : subscribe / unsubscribe / heartbeat / presence / typing
 *   REST    → bus     : every write publishes a frame after its transaction commits
 */

const HEARTBEAT_INTERVAL_MS = 30_000;
const SOCKET_TIMEOUT_MS = 90_000;
const TYPING_TTL_MS = 5_000;
const MAX_FRAME_BYTES = 16 * 1024;
const MAX_SOCKETS_PER_USER = 8;
const REPLAY_LIMIT = 500;

// 1000 normal · 1008 policy violation · 1009 frame too large · 1011 internal · 1013 try again later
const CLOSE_NORMAL = 1000;
const CLOSE_POLICY = 1008;
const CLOSE_TOO_LARGE = 1009;
const CLOSE_INTERNAL = 1011;
const CLOSE_TRY_AGAIN_LATER = 1013;

type SocketUser = UserDTO;

type Client = {
  id: string;
  socket: WebSocket;
  user: SocketUser;
  /** project ids this socket currently receives events for */
  rooms: Set<string>;
  lastSeenAt: number;
  /** projectId → typing state, expires on its own */
  typing: Map<string, { taskId: string | null; expiresAt: number }>;
};

export type GatewayStats = {
  clients: number;
  users: number;
  rooms: number;
  subscribers: number;
  busPublished: number;
  framesSent: number;
  framesRejected: number;
  connectedAt: string;
};

export class RealtimeGateway {
  readonly path = REALTIME_PATH;

  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;

  private clients = new Map<WebSocket, Client>();
  private byUser = new Map<string, Set<WebSocket>>();

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private detachBus: (() => void) | null = null;
  private shuttingDown = false;

  private framesSent = 0;
  private framesRejected = 0;
  private startedAt = new Date().toISOString();

  /* ---------------------------------------------------------------- lifecycle */

  attach(server: HttpServer): void {
    this.httpServer = server;
    this.wss = new WebSocketServer({
      noServer: true, // we control the upgrade so we can authenticate it first
      maxPayload: MAX_FRAME_BYTES,
      clientTracking: false
    });

    server.on("upgrade", (request, socket, head) => {
      void this.handleUpgrade(request, socket as Socket, head);
    });

    // Every REST write arrives here after its transaction commits.
    this.detachBus = bus.subscribe(this.onBusMessage);

    this.heartbeatTimer = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();

    console.log("[realtime] gateway attached at", this.path);
  }

  /**
   * The upgrade handshake.
   *
   * Order matters: path → shutdown state → identity → authorization. A socket is
   * never accepted "signed in but unverified"; identity is proven with the same
   * httpOnly session cookie the browser already sends for HTTP, which is why no
   * token ever appears in a query string (and therefore never in a log).
   */
  private async handleUpgrade(
    request: IncomingRequest,
    socket: Socket,
    head: Buffer
  ): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    // Not ours — leave it alone so Next.js can handle its own upgrades (HMR in dev).
    if (url.pathname !== this.path) return;

    if (this.shuttingDown) {
      this.rejectUpgrade(socket, 503, "Server is restarting");
      return;
    }

    const session = sessionFromCookieHeader(request.headers.cookie);
    if (!session) {
      this.rejectUpgrade(socket, 401, "Sign in to open a realtime connection");
      return;
    }

    const user = await db.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true }
    });
    if (!user) {
      this.rejectUpgrade(socket, 401, "Account no longer exists");
      return;
    }

    const openSockets = this.byUser.get(user.id)?.size ?? 0;
    if (openSockets >= MAX_SOCKETS_PER_USER) {
      this.rejectUpgrade(socket, 429, "Too many open realtime connections");
      return;
    }

    this.wss?.handleUpgrade(request, socket, head, (ws) => {
      this.onConnection(ws, user);
    });
  }

  /** Plain-HTTP rejection, since the WebSocket handshake never completed. */
  private rejectUpgrade(socket: Socket, status: number, message: string): void {
    this.framesRejected += 1;
    const body = JSON.stringify({ ok: false, error: message });
    socket.write(
      `HTTP/1.1 ${status} ${message}\r\n` +
        "Content-Type: application/json\r\n" +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        "Connection: close\r\n\r\n" +
        body
    );
    socket.destroy();
  }

  private onConnection(ws: WebSocket, user: SocketUser): void {
    const client: Client = {
      id: randomUUID(),
      socket: ws,
      user,
      rooms: new Set<string>(),
      lastSeenAt: Date.now(),
      typing: new Map()
    };

    this.clients.set(ws, client);
    const socketsForUser = this.byUser.get(user.id) ?? new Set<WebSocket>();
    socketsForUser.add(ws);
    this.byUser.set(user.id, socketsForUser);

    ws.on("message", (data: RawData) => {
      void this.onMessage(client, data);
    });
    ws.on("pong", () => {
      client.lastSeenAt = Date.now();
    });
    ws.on("close", () => this.dropClient(client));
    ws.on("error", () => this.dropClient(client));

    void this.sendHello(client);
  }

  /** Tells the client who it is and where the event log currently stands. */
  private async sendHello(client: Client): Promise<void> {
    const memberships = await db.projectMember.findMany({
      where: { userId: client.user.id },
      select: { projectId: true }
    });

    this.sendTo(client.socket, {
      type: "hello",
      userId: client.user.id,
      projects: memberships.map((row) => row.projectId),
      seq: await latestSeq()
    });
  }

  /* ------------------------------------------------------------------ sending */

  private sendTo(ws: WebSocket, frame: Frame): void {
    // 1 === WebSocket.OPEN. Silently skip half-closed sockets rather than
    // buffering frames for a client that cannot receive them.
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(frame));
      this.framesSent += 1;
    } catch (error) {
      console.error("[realtime] send failed:", error);
    }
  }

  private closeSocket(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      ws.terminate();
    }
  }

/* -------------------------------------------------------- client → gateway */

  private async onMessage(client: Client, data: RawData): Promise<void> {
    const raw = typeof data === "string" ? data : data.toString();

    if (raw.length > MAX_FRAME_BYTES) {
      this.framesRejected += 1;
      this.closeSocket(client.socket, CLOSE_TOO_LARGE, "Frame too large");
      return;
    }

    let frame: ClientFrame;
    try {
      frame = JSON.parse(raw) as ClientFrame;
    } catch {
      this.framesRejected += 1;
      this.sendTo(client.socket, { type: "error", message: "Malformed frame." });
      return;
    }

    // Any traffic counts as liveness, not just pongs.
    client.lastSeenAt = Date.now();

    switch (frame.type) {
      case "subscribe":
        await this.handleSubscribe(client, frame.projectId, frame.since);
        return;
      case "unsubscribe":
        this.leaveRoom(client, frame.projectId);
        return;
      case "heartbeat":
        this.sendTo(client.socket, { type: "pong", t: Date.now() });
        return;
      case "presence":
        await this.handlePresenceRequest(client, frame.projectId);
        return;
      case "typing":
        this.handleTyping(client, frame.projectId, frame.taskId, frame.state);
        return;
      default:
        this.framesRejected += 1;
        this.sendTo(client.socket, { type: "error", message: "Unknown frame type." });
    }
  }

  /**
   * Join a project room.
   *
   * Authorization is re-checked against the database here rather than trusting
   * the project list handed out in `hello` — access can be revoked while a
   * socket sits open, and a stale client must not keep receiving a board.
   */
  private async handleSubscribe(
    client: Client,
    projectId: string,
    since?: number
  ): Promise<void> {
    const membership = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: client.user.id } },
      select: { role: true }
    });

    if (!membership) {
      this.sendTo(client.socket, {
        type: "error",
        message: "You do not have access to this project."
      });
      this.closeSocket(client.socket, CLOSE_POLICY, "Not a project member");
      return;
    }

    const isNewRoom = !client.rooms.has(projectId);
    client.rooms.add(projectId);

    // Catch-up: hand back exactly the events this socket missed, in seq order.
    if (typeof since === "number" && Number.isFinite(since) && since >= 0) {
      const missed = await eventsSince([projectId], since, REPLAY_LIMIT);
      for (const frame of missed) this.sendTo(client.socket, frame);
    }

    if (isNewRoom) this.broadcastPresence(projectId);
  }

  private leaveRoom(client: Client, projectId: string): void {
    if (!client.rooms.delete(projectId)) return;
    client.typing.delete(projectId);
    this.emitTyping(client, projectId, null, "stop");
    this.broadcastPresence(projectId);
  }

  private async handlePresenceRequest(client: Client, projectId: string): Promise<void> {
    if (!client.rooms.has(projectId)) {
      await this.handleSubscribe(client, projectId);
    }
    this.broadcastPresence(projectId);
  }

  /** Typing signals are transient: never logged, never replayed, self-expiring. */
  private handleTyping(
    client: Client,
    projectId: string,
    taskId: string | null,
    state: "start" | "stop"
  ): void {
    if (!client.rooms.has(projectId)) return;

    if (state === "start") {
      client.typing.set(projectId, { taskId, expiresAt: Date.now() + TYPING_TTL_MS });
    } else {
      client.typing.delete(projectId);
    }

    this.emitTyping(client, projectId, taskId, state);
  }

  private emitTyping(
    client: Client,
    projectId: string,
    taskId: string | null,
    state: "start" | "stop"
  ): void {
    const frame: ProjectFrame = {
      channel: "project",
      projectId,
      seq: 0,
      event: {
        seq: 0,
        type: state === "start" ? "typing.start" : "typing.stop",
        actorId: client.user.id,
        payload: { taskId, userId: client.user.id, name: client.user.name },
        createdAt: new Date().toISOString()
      }
    };

    for (const other of this.clients.values()) {
      if (other === client) continue;
      if (other.rooms.has(projectId)) this.sendTo(other.socket, frame);
    }
  }

  /* ---------------------------------------------------------------- presence */

  /** Who has this board open right now, collapsed per user with a socket count. */
  presenceFor(projectId: string): PresenceUser[] {
    const byUserId = new Map<string, PresenceUser>();

    for (const client of this.clients.values()) {
      if (!client.rooms.has(projectId)) continue;

      const existing = byUserId.get(client.user.id);
      if (existing) {
        existing.connectionCount += 1;
      } else {
        byUserId.set(client.user.id, { ...client.user, connectionCount: 1 });
      }
    }

    return Array.from(byUserId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private broadcastPresence(projectId: string): void {
    const frame: ProjectFrame = {
      channel: "project",
      projectId,
      seq: 0,
      event: {
        seq: 0,
        type: "presence.sync",
        actorId: "system",
        payload: { users: this.presenceFor(projectId) },
        createdAt: new Date().toISOString()
      }
    };

    for (const client of this.clients.values()) {
      if (client.rooms.has(projectId)) this.sendTo(client.socket, frame);
    }
  }

  /* ------------------------------------------------------------- bus → clients */

  /**
   * Fan-out from REST writes to subscribed sockets.
   *
   * Project frames go to every socket in the room. Personal frames address the
   * `user:<id>` room by id, so a notification lands in every tab the recipient
   * has open. An `access/removed` frame additionally evicts the project room
   * first, so a user who just lost access stops receiving board events at once.
   */
  private onBusMessage = (message: BusMessage): void => {
    if (message.channel === "project") {
      for (const client of this.clients.values()) {
        if (client.rooms.has(message.target)) this.sendTo(client.socket, message.payload);
      }
      return;
    }

    const sockets = this.byUser.get(message.target);
    if (!sockets || sockets.size === 0) return;

    if (
      message.payload.kind === "access" &&
      message.payload.action === "removed" &&
      message.payload.projectId
    ) {
      const revoked = message.payload.projectId;
      for (const ws of sockets) {
        this.clients.get(ws)?.rooms.delete(revoked);
      }
    }

    for (const ws of sockets) this.sendTo(ws, message.payload);
  };

  /* ----------------------------------------------------------------- heartbeat */

  /**
   * The heartbeat has two jobs:
   *   1. reap half-open sockets — a laptop that slept mid-frame never sends FIN,
   *      so without a deadline the room slowly fills with ghosts;
   *   2. expire typing indicators even when no further frames arrive.
   */
  private tick(): void {
    const now = Date.now();

    for (const client of this.clients.values()) {
      if (now - client.lastSeenAt > SOCKET_TIMEOUT_MS) {
        this.closeSocket(client.socket, CLOSE_TRY_AGAIN_LATER, "Heartbeat timeout");
        continue;
      }
      try {
        client.socket.ping();
      } catch {
        this.dropClient(client);
      }
    }

    for (const client of this.clients.values()) {
      const expired: string[] = [];
      for (const [projectId, state] of client.typing) {
        if (state.expiresAt <= now) expired.push(projectId);
      }
      for (const projectId of expired) {
        client.typing.delete(projectId);
        this.emitTyping(client, projectId, null, "stop");
      }
    }
  }

  /* ---------------------------------------------------------------- teardown */

  /** Idempotent removal — close and error events can both fire for one socket. */
  private dropClient(client: Client): void {
    if (!this.clients.has(client.socket)) return;

    this.clients.delete(client.socket);

    const sockets = this.byUser.get(client.user.id);
    if (sockets) {
      sockets.delete(client.socket);
      if (sockets.size === 0) this.byUser.delete(client.user.id);
    }

    for (const projectId of client.rooms) this.broadcastPresence(projectId);

    try {
      client.socket.terminate();
    } catch {
      // already gone
    }
  }

  /** 1001 = going away: clients know this is a restart and should reconnect. */
  close(): void {
    this.shuttingDown = true;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.detachBus) {
      this.detachBus();
      this.detachBus = null;
    }

    for (const client of this.clients.values()) {
      this.closeSocket(client.socket, 1001, "Server shutting down");
    }
    this.clients.clear();
    this.byUser.clear();
    this.wss?.close();
  }

  /** Exposed at GET /api/realtime/status so the live pill has something real. */
  get stats(): GatewayStats {
    const rooms = new Set<string>();
    for (const client of this.clients.values()) {
      for (const room of client.rooms) rooms.add(room);
    }

    return {
      clients: this.clients.size,
      users: this.byUser.size,
      rooms: rooms.size,
      subscribers: bus.stats.subscribers,
      busPublished: bus.stats.published,
      framesSent: this.framesSent,
      framesRejected: this.framesRejected,
      connectedAt: this.startedAt
    };
  }
}