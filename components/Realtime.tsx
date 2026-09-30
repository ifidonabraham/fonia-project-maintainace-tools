"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  ClientFrame,
  ConnectionStatus,
  Frame,
  NotificationDTO,
  PresenceUser,
  ProjectFrame,
  UserFrame
} from "../lib/types";
import { pushToast } from "./Toast";

/**
 * The client half of the realtime system.
 *
 * One socket per browser tab, shared through context — the sidebar, the board,
 * the task drawer and the notification bell all read from this, so opening five
 * cards does not open five connections.
 *
 * Responsibilities that make it production-shaped rather than a demo:
 *   · reconnect with exponential backoff + jitter (never a thundering herd)
 *   · resume, not reload — every room is re-subscribed with the last seq this
 *     tab actually applied, so the gateway replays only the gap
 *   · dedupe by seq, so a replayed frame that already arrived is ignored
 *   · an SSE fallback when WebSockets cannot be established at all
 *   · reconnect when the tab becomes visible again (laptops sleep)
 *   · typing indicators that expire on their own
 */

type ProjectHandler = (frame: ProjectFrame) => void;

type TypingEntry = { userId: string; name: string; taskId: string | null; at: number };

type RealtimeContextValue = {
  status: ConnectionStatus;
  transport: "websocket" | "sse" | "none";
  lastSeq: number;
  registerProject: (projectId: string, since: number, handler: ProjectHandler) => () => void;
  presenceFor: (projectId: string) => PresenceUser[];
  typingFor: (projectId: string, taskId?: string | null) => TypingEntry[];
  sendTyping: (projectId: string, taskId: string | null, state: "start" | "stop") => void;
  unreadCount: number;
  latestNotification: NotificationDTO | null;
  setUnreadCount: (value: number) => void;
  onAccessChange: (handler: (projectId: string, action: string) => void) => () => void;
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const BACKOFF_MIN_MS = 800;
const BACKOFF_MAX_MS = 20_000;
/** After this many failed socket attempts, try the SSE fallback instead. */
const WS_ATTEMPTS_BEFORE_FALLBACK = 4;
const TYPING_TTL_MS = 5_000;

export function RealtimeProvider({
  realtimePath,
  initialUnreadCount = 0,
  children
}: {
  realtimePath: string;
  initialUnreadCount?: number;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [transport, setTransport] = useState<"websocket" | "sse" | "none">("none");
  const [lastSeq, setLastSeq] = useState(0);
  const [presence, setPresence] = useState<Record<string, PresenceUser[]>>({});
  const [typing, setTyping] = useState<Record<string, TypingEntry[]>>({});
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [latestNotification, setLatestNotification] = useState<NotificationDTO | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const closedByUs = useRef(false);

  // Mutable mirrors of state the socket callbacks read without causing renders.
  const rooms = useRef<Map<string, ProjectHandler>>(new Map());
  const seenSeq = useRef(0);
  const appliedThrough = useRef(new Map<string, number>());
  const accessHandlers = useRef(new Set<(projectId: string, action: string) => void>());

  /* --------------------------------------------------------------- outbound */

  const send = useCallback((frame: ClientFrame) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(frame));
    }
  }, []);

  const registerProject = useCallback(
    (projectId: string, since: number, handler: ProjectHandler) => {
      rooms.current.set(projectId, handler);
      // Ask for the gap between what the server has and what this tab applied.
      const cursor = Math.max(since, appliedThrough.current.get(projectId) ?? 0);
      send({ type: "subscribe", projectId, since: cursor });
      send({ type: "presence", projectId });

      return () => {
        rooms.current.delete(projectId);
        send({ type: "unsubscribe", projectId });
        setPresence((current) => {
          const next = { ...current };
          delete next[projectId];
          return next;
        });
      };
    },
    [send]
  );

  const sendTyping = useCallback(
    (projectId: string, taskId: string | null, state: "start" | "stop") => {
      send({ type: "typing", projectId, taskId, state });
    },
    [send]
  );

  const onAccessChange = useCallback((handler: (projectId: string, action: string) => void) => {
    accessHandlers.current.add(handler);
    return () => {
      accessHandlers.current.delete(handler);
    };
  }, []);

  /* ---------------------------------------------------------------- inbound */

  const applyFrame = useCallback((frame: Frame) => {
    if ("type" in frame) {
      if (frame.type === "hello") {
        seenSeq.current = Math.max(seenSeq.current, frame.seq);
        setLastSeq(seenSeq.current);
      }
      return;
    }

    if (frame.channel === "project") {
      const { projectId } = frame;
      const event = frame.event;

      // Dedupe: a replay can legitimately repeat a frame we already applied.
      if (frame.seq > 0) {
        const applied = appliedThrough.current.get(projectId) ?? 0;
        if (frame.seq <= applied) return;
        appliedThrough.current.set(projectId, frame.seq);
        seenSeq.current = Math.max(seenSeq.current, frame.seq);
        setLastSeq(seenSeq.current);
      }

      if (event.type === "presence.sync") {
        const users = (event.payload.users as PresenceUser[]) ?? [];
        setPresence((current) => ({ ...current, [projectId]: users }));
        return;
      }

      if (event.type === "typing.start" || event.type === "typing.stop") {
        const userId = String(event.payload.userId ?? event.actorId);
        const taskId = (event.payload.taskId as string | null) ?? null;
        const name = String(event.payload.name ?? "Someone");

        setTyping((current) => {
          const existing = current[projectId] ?? [];
          const others = existing.filter((entry) => entry.userId !== userId);
          const next =
            event.type === "typing.start"
              ? [...others, { userId, name, taskId, at: Date.now() }]
              : others;
          return { ...current, [projectId]: next };
        });
        return;
      }

      rooms.current.get(projectId)?.(frame);
      return;
    }

    // Personal frames: notifications and access changes.
    const userFrame = frame as UserFrame;

    if (typeof userFrame.unreadCount === "number") setUnreadCount(userFrame.unreadCount);

    if (userFrame.kind === "notification" && userFrame.notification) {
      setLatestNotification(userFrame.notification);
      pushToast({
        kind: "info",
        title: userFrame.notification.title,
        text: userFrame.notification.body ?? undefined
      });
      return;
    }

    if (userFrame.kind === "access" && userFrame.projectId) {
      const removed = userFrame.action === "removed";
      pushToast({
        kind: removed ? "error" : "success",
        title: removed ? "You were removed from a project" : "You were added to a project",
        text: "Refreshing your boards…"
      });
      for (const handler of accessHandlers.current) {
        handler(userFrame.projectId, userFrame.action ?? "role");
      }
    }
  }, []);

  /* ------------------------------------------- connection lifecycle (one per tab) */

  useEffect(() => {
    closedByUs.current = false;
    let disposed = false;

    const url = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}${realtimePath}`;
    };

    const subscribeAll = (socket: WebSocket) => {
      for (const projectId of rooms.current.keys()) {
        const cursor = appliedThrough.current.get(projectId) ?? 0;
        socket.send(JSON.stringify({ type: "subscribe", projectId, since: cursor }));
        socket.send(JSON.stringify({ type: "presence", projectId }));
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

      const base = Math.min(
        BACKOFF_MIN_MS * 2 ** Math.max(0, attemptRef.current - 1),
        BACKOFF_MAX_MS
      );
      // Half fixed, half random — several tabs reconnecting at once spread out.
      const delay = base / 2 + Math.random() * (base / 2);

      reconnectTimer.current = setTimeout(() => connect(), delay);
    };

    /** Fallback transport: one-directional, no typing, but the board stays live. */
    const startStream = () => {
      if (disposed || streamRef.current) return;
      if (typeof EventSource === "undefined") {
        setStatus("offline");
        return;
      }

      let since = 0;
      for (const value of appliedThrough.current.values()) since = Math.max(since, value);

      setTransport("sse");
      setStatus("connecting");

      const stream = new EventSource(`${realtimePath}/stream?since=${since}`);
      streamRef.current = stream;

      stream.onopen = () => {
        attemptRef.current = 0;
        setStatus("live");
      };
      stream.onmessage = (event) => {
        try {
          applyFrame(JSON.parse(event.data as string) as Frame);
        } catch {
          // Ignore frames we cannot parse rather than tearing the stream down.
        }
      };
      stream.onerror = () => {
        stream.close();
        streamRef.current = null;
        if (disposed) return;
        attemptRef.current += 1;
        setStatus("reconnecting");
        scheduleReconnect();
      };
    };

    const connect = () => {
      if (disposed) return;

      // Give up on sockets after repeated failures and take the SSE path.
      if (typeof WebSocket === "undefined" || attemptRef.current >= WS_ATTEMPTS_BEFORE_FALLBACK) {
        startStream();
        return;
      }

      setTransport("websocket");
      setStatus((current) => (current === "live" ? "live" : "connecting"));

      let socket: WebSocket;
      try {
        socket = new WebSocket(url());
      } catch {
        attemptRef.current += 1;
        startStream();
        return;
      }

      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setStatus("live");
        subscribeAll(socket);
      };

      socket.onmessage = (event) => {
        try {
          applyFrame(JSON.parse(event.data as string) as Frame);
        } catch {
          // Malformed frame — ignore, keep the connection.
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (disposed || closedByUs.current) return;
        attemptRef.current += 1;
        setStatus(attemptRef.current > 1 ? "reconnecting" : "connecting");
        scheduleReconnect();
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          // onclose handles the retry
        }
      };
    };

    connect();

    // A laptop that slept comes back with a dead socket — reconnect immediately.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (socketRef.current || streamRef.current) return;
      attemptRef.current = 0;
      connect();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Application-level heartbeat (the gateway also pings at the protocol level).
    const heartbeat = setInterval(() => send({ type: "heartbeat", t: Date.now() }), 25_000);

    // Typing indicators expire client-side even if a stop frame never arrives.
    const typingSweep = setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL_MS;
      setTyping((current) => {
        let changed = false;
        const next: Record<string, TypingEntry[]> = {};
        for (const [projectId, entries] of Object.entries(current)) {
          const alive = entries.filter((entry) => entry.at > cutoff);
          if (alive.length !== entries.length) changed = true;
          next[projectId] = alive;
        }
        return changed ? next : current;
      });
    }, 2_000);

    return () => {
      disposed = true;
      closedByUs.current = true;
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(heartbeat);
      clearInterval(typingSweep);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (typingTimer.current) clearInterval(typingTimer.current);
      streamRef.current?.close();
      streamRef.current = null;
      try {
        socketRef.current?.close();
      } catch {
        // already closed
      }
      socketRef.current = null;
    };
  }, [applyFrame, realtimePath, send]);

  /* ------------------------------------------------------------ context value */

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      transport,
      lastSeq,
      registerProject,
      presenceFor: (projectId: string) => presence[projectId] ?? [],
      typingFor: (projectId: string, taskId?: string | null) =>
        (typing[projectId] ?? []).filter((entry) =>
          taskId === undefined ? true : entry.taskId === taskId
        ),
      sendTyping,
      unreadCount,
      latestNotification,
      setUnreadCount,
      onAccessChange
    }),
    [
      status,
      transport,
      lastSeq,
      registerProject,
      presence,
      typing,
      sendTyping,
      unreadCount,
      latestNotification,
      onAccessChange
    ]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Realtime state for any client component inside the app shell. */
export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used inside <RealtimeProvider>.");
  }
  return context;
}

/** Small helper for the "live / reconnecting" pill in the topbar. */
export function connectionLabel(status: ConnectionStatus, transport: string): string {
  if (status === "live") return transport === "sse" ? "Live (fallback)" : "Live";
  if (status === "connecting") return "Connecting…";
  if (status === "reconnecting") return "Reconnecting…";
  return "Offline";
}