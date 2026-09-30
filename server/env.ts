import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A tiny .env loader (~25 lines, no dependencies).
 *
 * Next.js loads .env files for the app, but a custom server, the seed script and
 * the test runner start *before* Next initialises — and the gateway needs
 * AUTH_SECRET and DATABASE_URL at boot. Rather than pull in external tooling,
 * this module parses the files itself and is imported as the very first side
 * effect in server.ts, prisma/seed.ts and tests/run.ts.
 *
 * Precedence matches Next.js: real environment variables win, then .env.local,
 * then .env. Existing values are never overwritten.
 */

export function loadEnv(root: string = process.cwd()): string[] {
  const loaded: string[] = [];

  for (const file of [".env.local", ".env"]) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    loaded.push(file);

    for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const equals = line.indexOf("=");
      if (equals === -1) continue;

      const key = line.slice(0, equals).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(equals + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);

      process.env[key] = value;
    }
  }

  return loaded;
}

// Side effect: importing this module is enough to populate process.env.
loadEnv();