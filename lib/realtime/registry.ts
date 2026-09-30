import type { PresenceUser } from "../types";

/**
 * A handle the Next.js runtime can use to reach the realtime gateway.
 *
 * The gateway is constructed by the custom server, and Next bundles server code
 * separately — so a normal import would give a route handler a *different*
 * module instance. Registering a small interface on globalThis lets REST routes
 * ask the one live gateway for presence and statistics.
 */

export type RealtimeRegistry = {
  presence: (projectId: string) => PresenceUser[];
  stats: () => Record<string, unknown>;
  path: string;
};

const globalForRegistry = globalThis as unknown as {
  foniaRealtimeRegistry?: RealtimeRegistry;
};

export function registerRealtime(registry: RealtimeRegistry): void {
  globalForRegistry.foniaRealtimeRegistry = registry;
}

export function getRealtime(): RealtimeRegistry | null {
  return globalForRegistry.foniaRealtimeRegistry ?? null;
}

/**
 * Presence is a nice-to-have: if the gateway is not running (for example
 * `npm run dev:ui` without the custom server) the board still renders, just
 * without the live viewer list.
 */
export function presenceFor(projectId: string): PresenceUser[] {
  try {
    return getRealtime()?.presence(projectId) ?? [];
  } catch {
    return [];
  }
}