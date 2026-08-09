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

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import * as path from "node:path";

export interface BlobTrustRoot {
  secret: string;
  bootId: string;
}

export interface BlobTokenBinding {
  userId: string;
  storageRootId: string;
}

const TRUST_ROOT_KEY = Symbol.for("creatoros.blob-trust-root.v2");
type TrustRootGlobal = typeof globalThis & {
  [TRUST_ROOT_KEY]?: Readonly<BlobTrustRoot>;
};

/**
 * Sidecar 启动最早期从 Rust 继承 fd 安装一次。重复安装（哪怕同值）视为启动异常，
 * 防止运行中轮换后旧 URL 与新 URL 产生不可审计的混用窗口。
 */
export function installBlobTrustRoot(root: BlobTrustRoot): void {
  if (root.secret.length < 32 || root.bootId.length < 16) {
    throw new Error("invalid blob trust root");
  }
  const state = globalThis as TrustRootGlobal;
  if (state[TRUST_ROOT_KEY]) throw new Error("blob trust root already installed");
  state[TRUST_ROOT_KEY] = Object.freeze({ ...root });
}

/** 没有 Rust 注入的随机信任根就失败关闭；生产代码不存在源码固定回退。 */
export function blobTrustRoot(): Readonly<BlobTrustRoot> {
  const installed = (globalThis as TrustRootGlobal)[TRUST_ROOT_KEY];
  if (installed) return installed;
  throw new Error("blob trust root unavailable");
}

/** 仅暴露不可逆 root 身份，不把用户目录写入 URL/token payload。 */
export function blobStorageRootId(rootPath: string): string {
  return createHash("sha256").update(path.resolve(rootPath)).digest("hex");
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

function tokenPayload(
  method: BlobMethod,
  storageKey: string,
  exp: number,
  binding: BlobTokenBinding,
  bootId: string,
): string {
  // NUL 分隔 + 固定版本，避免冒号出现在 user/key 中造成拼接歧义。
  return [
    "blob-v2",
    method,
    binding.userId,
    binding.storageRootId,
    storageKey,
    String(exp),
    bootId,
  ].join("\0");
}

/** Mint an HMAC token bound to tenant, storage root, method, expiry and boot. */
export function signBlobToken(
  method: BlobMethod,
  storageKey: string,
  exp: number,
  binding: BlobTokenBinding,
  trustRoot: Readonly<BlobTrustRoot> = blobTrustRoot(),
): string {
  return createHmac("sha256", trustRoot.secret)
    .update(tokenPayload(method, storageKey, exp, binding, trustRoot.bootId))
    .digest("hex");
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
  binding: BlobTokenBinding,
  now: number = Date.now(),
  trustRoot: Readonly<BlobTrustRoot> = blobTrustRoot(),
): VerifyResult {
  if (!token || !Number.isFinite(exp)) return { ok: false, reason: "missing" };
  if (exp <= now) return { ok: false, reason: "expired" };
  const expected = signBlobToken(method, storageKey, exp, binding, trustRoot);
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
