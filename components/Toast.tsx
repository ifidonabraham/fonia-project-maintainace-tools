"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Toast notifications — written here rather than pulled from a library, so the
 * look matches the Fonia Labs design system and nothing extra ships to the client.
 *
 * Two ways in, on purpose:
 *   · `useToast()` inside React components
 *   · `pushToast()` from anywhere (the realtime hook, a socket event handler,
 *     a service) via a window CustomEvent, so no context has to be threaded
 *     through the component tree just to show a message.
 */

export type ToastKind = "success" | "error" | "info";

export type ToastInput = {
  kind?: ToastKind;
  title: string;
  text?: string;
  /** milliseconds on screen; 0 keeps it until dismissed */
  duration?: number;
};

type Toast = Required<Pick<ToastInput, "kind" | "title" | "duration">> & {
  id: number;
  text?: string;
  leaving?: boolean;
};

const TOAST_EVENT = "fonia:toast";
let toastId = 0;

/** Show a toast from any client-side code. */
export function pushToast(input: ToastInput): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: input }));
}

export function useToast() {
  return useMemo(
    () => ({
      success: (title: string, text?: string) => pushToast({ kind: "success", title, text }),
      error: (title: string, text?: string) => pushToast({ kind: "error", title, text }),
      info: (title: string, text?: string) => pushToast({ kind: "info", title, text })
    }),
    []
  );
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  const color = kind === "success" ? "#34d399" : kind === "error" ? "#f87171" : "#38bdf8";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "success" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </>
      ) : kind === "error" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4.5" />
          <path d="M12 16h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </>
      )}
    </svg>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    // Let the exit animation finish before removing the node.
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 220);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToastInput>).detail;
      if (!detail?.title) return;

      toastId += 1;
      const toast: Toast = {
        id: toastId,
        kind: detail.kind ?? "info",
        title: detail.title,
        text: detail.text,
        duration: detail.duration ?? 5000
      };

      setToasts((current) => [...current.slice(-3), toast]);

      if (toast.duration > 0) {
        timers.current.set(
          toast.id,
          setTimeout(() => dismiss(toast.id), toast.duration)
        );
      }
    };

    window.addEventListener(TOAST_EVENT, handler as EventListener);
    const pending = timers.current;
    return () => {
      window.removeEventListener(TOAST_EVENT, handler as EventListener);
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, [dismiss]);

  return (
    <>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.kind}${toast.leaving ? " leaving" : ""}`}
          >
            <ToastIcon kind={toast.kind} />
            <div className="toast-body">
              <p className="toast-title">{toast.title}</p>
              {toast.text ? <p className="toast-text">{toast.text}</p> : null}
            </div>
            <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}