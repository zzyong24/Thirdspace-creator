import {
  scryptSync,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";

// Identity crypto primitives (Module 00, Task 2). All from node:crypto — zero
// native deps (no argon2/bcrypt). Real auth lives in the server/identity layer,
// so the non-determinism here (randomBytes salt/token) is intentional and out of
// the deterministic selector/fixture/mock layer.
//
// - Passwords: per-hash random 16-byte salt, scryptSync(plain, salt, 64),
//   stored as "${saltHex}:${derivedHex}". Verify re-derives and compares with
//   timingSafeEqual (constant-time).
// - Session tokens: opaque random 32-byte hex (the raw token, cookie-only); only
//   its sha256 hash is persisted in sessions.token_hash.

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;

/** Salted scrypt hash of a plaintext password. Returns "saltHex:derivedHex". */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time verify of a plaintext password against a stored hash. */
export function verifyPassword(plain: string, stored: string): boolean {
  const [saltHex, derivedHex] = stored.split(":");
  if (!saltHex || !derivedHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(derivedHex, "hex");
  const actual = scryptSync(plain, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** sha256 hash of a raw session token (lookup key for sessions.token_hash). */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a new opaque session token: raw 32-byte hex + its sha256 hash. */
export function generateSessionToken(): { raw: string; hash: string } {
  const raw = randomBytes(TOKEN_BYTES).toString("hex");
  return { raw, hash: hashToken(raw) };
}
