import { PrismaClient } from "@prisma/client";

/**
 * A single Prisma client for the whole process.
 *
 * Next.js dev mode re-evaluates modules on every hot reload, which would
 * otherwise open a new connection pool each time. Caching the instance on
 * globalThis keeps one pool for the API routes, the realtime gateway and the
 * scripts that share this process.
 */
const globalForPrisma = globalThis as unknown as { foniaPrisma?: PrismaClient };

export const db =
  globalForPrisma.foniaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.foniaPrisma = db;
}