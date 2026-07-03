// Local-filesystem object storage (item B) — the same `ObjectStoragePort` as the
// mock / S3 adapters (foundation §4 swap-seam), backing media bytes with files on
// the user's disk under a configurable `rootPath`. Bytes really land at
// `${rootPath}/${storageKey}`; a sidecar `${storageKey}.meta.json` carries the
// declared MIME/size/dims so headObject (phase-2 validation) can echo them.
//
// The two-phase upload works WITHOUT changing the FE: createPresignedUpload mints
// a token-gated URL on the in-app blob route (`/api/v1/blob/<encodedKey>?token=`),
// the upload button PUTs the bytes there (it's an http URL), the blob route
// verifies the token + path then writes to disk. getSignedUrl mints the GET
// variant for download/copy-link.
//
// No `server-only` import (so the adapter + its integration test load under
// vitest). Path-traversal + token signing live in ./blob-security (pure, unit-
// tested separately).
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ObjectStoragePort,
  HeadObjectResult,
  PresignedUpload,
} from "./object-storage";
import { safeJoin, signBlobToken } from "./blob-security";

export interface LocalFsObjectStorageConfig {
  // The resolved absolute media root (the service resolves `~`/default first).
  rootPath: string;
  // The public base path the blob route serves, e.g. "/api/v1/blob" (relative).
  publicBaseUrl: string;
  // Presigned URL TTL in ms (default 15 min).
  expiresInMs?: number;
}

export interface LocalFsObjectStorageDeps {
  // Deterministic key source (injected; no crypto/Math.random at the call site).
  nextKey: () => string;
  // Injected clock so a test can pin token `exp` deterministically.
  now?: () => number;
}

// What createPresignedUpload records into the sidecar (declared at create-time;
// headObject reads it back at complete-time, alongside the on-disk byte size).
interface SidecarMeta {
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

// Build the public URL the FE PUTs to / GETs from. The key is percent-encoded as
// a single path segment so a `/`-containing key (e.g. "image/uploads/x") survives
// the route's `[...key]` catch-all decode.
function blobUrl(
  publicBaseUrl: string,
  storageKey: string,
  method: "PUT" | "GET",
  exp: number,
): string {
  const encoded = storageKey
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const token = signBlobToken(method, storageKey, exp);
  return `${publicBaseUrl}/${encoded}?exp=${exp}&token=${token}`;
}

export function createLocalFsObjectStorage(
  cfg: LocalFsObjectStorageConfig,
  deps: LocalFsObjectStorageDeps,
): ObjectStoragePort {
  const expiresInMs = cfg.expiresInMs ?? 15 * 60 * 1000;
  const now = deps.now ?? (() => Date.now());

  function sidecarPath(absKey: string): string {
    return `${absKey}.meta.json`;
  }

  return {
    async createPresignedUpload({ assetType, mimeType, fileSize, folder, fileName }) {
      // [T-055d SPEC §7.1] 带 folder+fileName → 用户可见目录 + 原名保真(nextKey 前缀防
      // 重名覆盖,原名仍在末尾完整保留);否则旧规则 assetType/nextKey。fileName 只取
      // basename(路径分隔符剥掉,防注入;blob-security 在 PUT 时还有整链校验)。
      const safeName = fileName
        ? fileName.replace(/[/\\]/g, "_").replace(/^\.+/, "_").slice(0, 120)
        : null;
      const storageKey =
        folder && safeName
          ? `${folder}/${deps.nextKey()}-${safeName}`
          : `${assetType}/${deps.nextKey()}`;
      // Validate + resolve the on-disk path (mkdir its parent so the later PUT
      // lands cleanly) and write the sidecar with the declared metadata.
      const absKey = safeJoin(cfg.rootPath, storageKey);
      await fs.mkdir(path.dirname(absKey), { recursive: true });
      const meta: SidecarMeta = {
        mimeType,
        fileSize,
        // Image/video carry deterministic placeholder dims (the real probe is a
        // future enhancement); others null — mirrors the mock's shape.
        width: assetType === "image" || assetType === "video" ? 1920 : null,
        height: assetType === "image" || assetType === "video" ? 1080 : null,
        durationMs:
          assetType === "video" || assetType === "audio" ? 1000 : null,
      };
      await fs.writeFile(sidecarPath(absKey), JSON.stringify(meta), "utf8");
      const exp = now() + expiresInMs;
      return {
        storageKey,
        uploadUrl: blobUrl(cfg.publicBaseUrl, storageKey, "PUT", exp),
      } satisfies PresignedUpload;
    },

    async putObject({ storageKey, bytes, mimeType, assetType }) {
      // Server-side direct write (asset.generate) — the bytes land at
      // `${rootPath}/${storageKey}` exactly like a client PUT to the blob route would
      // leave them, plus a refreshed sidecar so headObject echoes the real MIME/dims.
      const absKey = safeJoin(cfg.rootPath, storageKey);
      await fs.mkdir(path.dirname(absKey), { recursive: true });
      const meta: SidecarMeta = {
        mimeType,
        fileSize: bytes.byteLength,
        width: assetType === "image" || assetType === "video" ? 1920 : null,
        height: assetType === "image" || assetType === "video" ? 1080 : null,
        durationMs:
          assetType === "video" || assetType === "audio" ? 1000 : null,
      };
      await fs.writeFile(sidecarPath(absKey), JSON.stringify(meta), "utf8");
      await fs.writeFile(absKey, bytes);
    },

    async headObject(storageKey) {
      const absKey = safeJoin(cfg.rootPath, storageKey);
      // Real on-disk size (the bytes the FE PUT) is the source of truth.
      const stat = await fs.stat(absKey);
      let meta: SidecarMeta | null = null;
      try {
        meta = JSON.parse(
          await fs.readFile(sidecarPath(absKey), "utf8"),
        ) as SidecarMeta;
      } catch {
        // No sidecar (a key written directly / a seeded fixture) — fall back to
        // generic metadata; the byte size still comes from fs.stat.
        meta = null;
      }
      const bytes = await fs.readFile(absKey);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      return {
        mimeType: meta?.mimeType || "application/octet-stream",
        fileSize: stat.size,
        checksum,
        width: meta?.width ?? null,
        height: meta?.height ?? null,
        durationMs: meta?.durationMs ?? null,
        mediaMetadata: {},
      } satisfies HeadObjectResult;
    },

    async getSignedUrl(storageKey) {
      const exp = now() + expiresInMs;
      return blobUrl(cfg.publicBaseUrl, storageKey, "GET", exp);
    },
  };
}
