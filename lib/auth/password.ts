import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/**
 * Password hashing — written directly on node:crypto, no third-party library.
 *
 * scrypt is the memory-hard KDF recommended by RFC 7914 and shipped in Node's
 * standard library, so this file adds zero dependencies to the supply chain.
 * Stored format (self-describing, so parameters can be raised later without
 * invalidating existing hashes):
 *
 *   scrypt$N$r$p$<salt base64url>$<derived key base64url>
 */
const COST_N = 16384; // 2^14 — ~16 MB of memory per hash
const BLOCK_SIZE_R = 8;
const PARALLELISM_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// Node requires maxmem >= 128 * N * r; give it headroom.
const MAX_MEM = 64 * 1024 * 1024;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(plain.normalize("NFKC"), salt, KEY_LENGTH, {
    N: COST_N,
    r: BLOCK_SIZE_R,
    p: PARALLELISM_P,
    maxmem: MAX_MEM
  });

  return [
    "scrypt",
    COST_N,
    BLOCK_SIZE_R,
    PARALLELISM_P,
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

/**
 * Constant-time verification. Returns false — never throws — for malformed or
 * legacy hashes so a bad database row cannot crash a login request.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEM
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Shared password policy so the UI and the API agree on the rules. */
export function passwordProblem(password: string, minLength: number): string | null {
  if (password.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (!/[a-zA-Z]/.test(password)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}