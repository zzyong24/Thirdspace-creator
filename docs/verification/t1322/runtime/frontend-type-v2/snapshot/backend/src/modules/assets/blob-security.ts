// Blob-storage security primitives (item B) — PURE functions, no fs / no network
// / no Next imports, so they unit-test in isolation and are the audit surface for
// the local-fs backend. Two concerns:
//
//   1. safeJoin(rootPath, key) — path-traversal guard. The storageKey is minted
//      server-side (never user-controlled), but the blob route receives it off
//      the wire, so we HARD-validate that the resolved absolute path stays inside
//      rootPath. Any `..` segment, absolute key, empty/`.`/`..` segment, or a
//      resolved path that escapes rootPath throws → the route maps that to 403.
//
//   2. signBlobToken / verifyBlobToken — an HMAC-SHA256 token gating PUT/GET on
//      the blob route. token = HMAC(`${method}:${storageKey}:${exp}`, secret).
//      The route only writes/reads bytes when the signature matches AND exp is in
//      the future. This prevents arbitrary write-to-disk / read-from-disk via the
//      public route. The compare is constant-time (timingSafeEqual).

import { createHmac, timingSafeEqual } from "node:crypto";
import * as path from "node:path";

// The process-wide HMAC secret for blob tokens. A fixed in-process dev default is
// used when CREATOROS_BLOB_SECRET is unset so local dev works out of the box; a
// real deployment MUST set the env (the default is not a secret). The default is
// intentionally constant (not random) so a presigned URL minted in one request
// still verifies in the next — randomizing per-process would break GET links
// across restarts.
const DEV_BLOB_SECRET =
  "creatoros-dev-blob-secret-v1-do-not-use-in-production";

export function blobSecret(): string {
  const env = process.env.CREATOROS_BLOB_SECRET;
  return env && env.length > 0 ? env : DEV_BLOB_SECRET;
}

// ---------------------------------------------------------------------------
// Path-traversal guard
// ---------------------------------------------------------------------------

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

/**
 * Resolve `key` under `rootPath`, rejecting any attempt to escape the root.
 * Returns the safe absolute path. Throws PathTraversalError on:
 *   - an absolute key (e.g. "/etc/passwd"),
 *   - any `..` / `.` / empty segment (after splitting on both `/` and `\`),
 *   - a resolved path that does not stay within `path.resolve(rootPath)`.
 *
 * Callers should `decodeURIComponent` the wire key BEFORE calling this so an
 * encoded `..%2f` cannot slip past the segment check.
 */
export function safeJoin(rootPath: string, key: string): string {
  if (typeof key !== "string" || key.length === 0) {
    throw new PathTraversalError("empty storage key");
  }
  // Reject an absolute key outright (path.resolve would honor it and escape root).
  if (path.isAbsolute(key)) {
    throw new PathTraversalError(`absolute key rejected: ${key}`);
  }
  // Split on BOTH separators so a `\..\` on a posix host is still caught.
  const segments = key.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      throw new PathTraversalError(`unsafe path segment in key: ${key}`);
    }
  }
  const root = path.resolve(rootPath);
  const resolved = path.resolve(root, key);
  // The resolved path must be the root itself or strictly under it (root + sep).
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new PathTraversalError(`key escapes root: ${key}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// HMAC token sign / verify
// ---------------------------------------------------------------------------

export type BlobMethod = "PUT" | "GET";

/** Mint an HMAC token for (method, storageKey, exp). `exp` is epoch millis. */
export function signBlobToken(
  method: BlobMethod,
  storageKey: string,
  exp: number,
  secret: string = blobSecret(),
): string {
  const payload = `${method}:${storageKey}:${exp}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export interface VerifyResult {
  ok: boolean;
  reason?: "missing" | "expired" | "bad-signature";
}

/**
 * Verify a blob token. Returns { ok:false, reason } on a missing/expired/forged
 * token, { ok:true } only when the signature matches AND `exp` (epoch millis) is
 * still in the future relative to `now`. Constant-time signature compare.
 */
export function verifyBlobToken(
  method: BlobMethod,
  storageKey: string,
  exp: number,
  token: string | null | undefined,
  now: number = Date.now(),
  secret: string = blobSecret(),
): VerifyResult {
  if (!token || !Number.isFinite(exp)) return { ok: false, reason: "missing" };
  if (exp <= now) return { ok: false, reason: "expired" };
  const expected = signBlobToken(method, storageKey, exp, secret);
  // Length-guard before timingSafeEqual (it throws on length mismatch).
  if (token.length !== expected.length) {
    return { ok: false, reason: "bad-signature" };
  }
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// rootPath legality (writable + not a system-sensitive prefix)
// ---------------------------------------------------------------------------

// Reject media roots that point at the filesystem root or a system directory.
// These are PREFIX checks on the resolved absolute path: writing media under
// /etc, /usr, /bin, … is never legitimate and the putStorage validator rejects
// it (surfacing a ValidationError, not silently accepting it).
const FORBIDDEN_ROOT_PREFIXES = [
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/boot",
  "/dev",
  "/proc",
  "/sys",
  "/var/run",
  "/System",
  "/Library",
];

/**
 * Decide whether `rootPath` is an allowable media root by PATH alone (the
 * fs-writability probe is done separately in the service). Returns a reason
 * string when illegal, or null when the path shape is acceptable. Rejects the
 * filesystem root and any forbidden system-directory prefix.
 */
export function rootPathLegalityReason(rootPath: string): string | null {
  if (typeof rootPath !== "string" || rootPath.trim().length === 0) {
    return "root path is empty";
  }
  const resolved = path.resolve(rootPath);
  if (resolved === path.parse(resolved).root) {
    return "root path may not be the filesystem root";
  }
  for (const prefix of FORBIDDEN_ROOT_PREFIXES) {
    if (resolved === prefix || resolved.startsWith(prefix + path.sep)) {
      return `root path may not be under a system directory (${prefix})`;
    }
  }
  return null;
}

export interface WorkspaceBlobScope {userId:string;groupId?:string|null;accountId?:string|null}
export function encodeWorkspaceBlobScope(scope:WorkspaceBlobScope):string {
 return Buffer.from(JSON.stringify({userId:scope.userId,groupId:scope.groupId??null,accountId:scope.accountId??null})).toString("base64url");
}
export function decodeWorkspaceBlobScope(value:string):WorkspaceBlobScope|null {
 try{const s=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));return typeof s.userId==="string" && (s.groupId===null||typeof s.groupId==="string") && (s.accountId===null||typeof s.accountId==="string") ? s : null;}catch{return null;}
}
export function signWorkspaceBlobToken(method:BlobMethod,key:string,exp:number,scope:string):string {
 return signBlobToken(method,`${scope}:${key}`,exp);
}
export function verifyWorkspaceBlobToken(method:BlobMethod,key:string,exp:number,token:string|null,scope:string):VerifyResult {
 return verifyBlobToken(method,`${scope}:${key}`,exp,token);
}
