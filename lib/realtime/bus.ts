import type { ProjectFrame, UserFrame } from "../types";

/**
 * The bridge between REST writes and live subscribers.
 *
 * A route handler finishes its database transaction, then publishes one message
 * here. Whatever is attached to the bus — the WebSocket gateway, the SSE
 * fallback, or a future Redis fan-out for multiple instances — delivers it.
 * Publishing never throws: a dead subscriber must not fail a user's write.
 *
 * NOTE ON THE SINGLETON
 * Next.js bundles each server module graph separately, so a module-level
 * `const bus = new RealtimeBus()` inside a route handler would NOT be the same
 * object the custom server imported. Parking the instance on globalThis gives
 * both copies one shared bus (the same trick Next itself recommends for Prisma).
 */

export type BusMessage =
  | { channel: "project"; target: string; payload: ProjectFrame; transient?: boolean }
  | { channel: "user"; target: string; payload: UserFrame; transient?: boolean };

export type BusListener = (message: BusMessage) => void;

export class RealtimeBus {
  private listeners = new Set<BusListener>();
  private published = 0;
  private failedDeliveries = 0;

  subscribe(listener: BusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(message: BusMessage): void {
    this.published += 1;
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (error) {
        this.failedDeliveries += 1;
        console.error("[bus] listener failed:", error);
      }
    }
  }

  get stats() {
    return {
      subscribers: this.listeners.size,
      published: this.published,
      failedDeliveries: this.failedDeliveries
    };
  }
}

const globalForBus = globalThis as unknown as { foniaRealtimeBus?: RealtimeBus };

export const bus: RealtimeBus = globalForBus.foniaRealtimeBus ?? new RealtimeBus();
globalForBus.foniaRealtimeBus = bus;

/** Convenience wrappers so callers do not hand-build envelopes. */
export function publishToProject(projectId: string, frame: ProjectFrame, transient = false): void {
  bus.publish({ channel: "project", target: projectId, payload: frame, transient });
}

export function publishToUser(userId: string, frame: UserFrame): void {
  bus.publish({ channel: "user", target: userId, payload: frame });
}