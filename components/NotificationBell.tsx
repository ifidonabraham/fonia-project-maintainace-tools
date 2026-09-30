"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "../lib/client/api";
import type { NotificationDTO } from "../lib/types";
import { useRealtime } from "./Realtime";
import { useToast } from "./Toast";
import { timeAgo } from "../lib/time";

/**
 * The notification bell.
 *
 * Unread count and arriving notifications come from the realtime context — the
 * socket already pushes them — while the list itself is fetched over REST when
 * the panel opens. That split keeps socket payloads small and means the panel
 * always shows the server's version of the truth.
 */
export function NotificationBell() {
  const { unreadCount, setUnreadCount, latestNotification } = useRealtime();
  const toast = useToast();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ notifications: NotificationDTO[]; unreadCount: number }>(
        "/api/notifications?limit=30"
      );
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (error) {
      toast.error("Could not load notifications", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [setUnreadCount, toast]);

  // First open loads the list; the socket keeps the badge live from then on.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // A notification arriving now goes straight to the top of an open panel.
  useEffect(() => {
    if (!latestNotification) return;
    setItems((current) => {
      if (current.some((item) => item.seq === latestNotification.seq)) return current;
      return [latestNotification, ...current].slice(0, 50);
    });
    setPulse(true);
    const timer = setTimeout(() => setPulse(false), 600);
    return () => clearTimeout(timer);
  }, [latestNotification]);

  // Click-away and Escape close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = useCallback(async () => {
    try {
      const data = await api.patch<{ updated: number; unreadCount: number }>(
        "/api/notifications",
        {}
      );
      setUnreadCount(data.unreadCount);
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      if (data.updated > 0) toast.success("All caught up", "Notifications marked as read.");
    } catch (error) {
      toast.error("Could not update notifications", errorMessage(error));
    }
  }, [setUnreadCount, toast]);

  const openNotification = useCallback(
    async (notification: NotificationDTO) => {
      setOpen(false);

      if (!notification.readAt) {
        try {
          const data = await api.patch<{ unreadCount: number }>("/api/notifications", {
            seqs: [notification.seq]
          });
          setUnreadCount(data.unreadCount);
          setItems((current) =>
            current.map((item) =>
              item.seq === notification.seq ? { ...item, readAt: new Date().toISOString() } : item
            )
          );
        } catch {
          // Opening the card matters more than the read receipt.
        }
      }

      if (notification.projectId) {
        const target = notification.taskId
          ? `/projects/${notification.projectId}?task=${notification.taskId}`
          : `/projects/${notification.projectId}`;
        router.push(target);
      }
    },
    [router, setUnreadCount]
  );

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        className={`bell-btn${open ? " open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className={`bell-count${pulse ? " pulse" : ""}`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <h4>Notifications</h4>
            <span className="spacer" />
            <button onClick={() => void markAllRead()} disabled={unreadCount === 0}>
              Mark all read
            </button>
          </div>

          {loading && items.length === 0 ? (
            <div className="notif-empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="notif-empty">
              Nothing yet. Assignments, mentions and replies land here.
            </div>
          ) : (
            <div className="notif-list">
              {items.map((item) => (
                <button
                  key={item.seq}
                  className={`notif-item${item.readAt ? "" : " unread"}`}
                  onClick={() => void openNotification(item)}
                >
                  <span
                    className="avatar sm"
                    style={{ background: item.actor?.avatarColor ?? "#38bdf8" }}
                    aria-hidden="true"
                  >
                    {item.actor ? initials(item.actor.name) : "•"}
                  </span>
                  <span className="notif-body">
                    <span className="notif-title">{item.title}</span>
                    {item.body ? <span className="notif-text">{item.body}</span> : null}
                    <span className="notif-time">{timeAgo(item.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

