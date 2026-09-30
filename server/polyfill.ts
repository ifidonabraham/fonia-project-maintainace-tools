/**
 * Polyfill for Next.js 16 on Node.js 22+.
 *
 * Next.js 16 reads globalThis.AsyncLocalStorage at module evaluation time
 * (not via require('node:async_hooks')) to determine if the Node runtime is
 * available. Node.js does not expose AsyncLocalStorage on globalThis by default,
 * so we register it here. This file must be the very first import in server.ts.
 */
import { AsyncLocalStorage, AsyncResource } from "node:async_hooks";

/* eslint-disable @typescript-eslint/no-explicit-any */
if (!("AsyncLocalStorage" in globalThis)) {
  (globalThis as any).AsyncLocalStorage = AsyncLocalStorage;
}

if (!("AsyncResource" in globalThis)) {
  (globalThis as any).AsyncResource = AsyncResource;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
