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
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveFfprobePath } from "@creatoros/ai-worker";
import type {
  ObjectStoragePort,
  HeadObjectResult,
  PresignedUpload,
} from "./object-storage";
import { accountKeyPrefix } from "./object-storage";
import { safeJoin, signBlobToken } from "./blob-security";
import { extForMime } from "../../lib/mime-ext";

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

// [T-296] 真媒体探针(ffprobe):替换原「durationMs 硬编码 1000 + 尺寸 1920×1080」的占位。
// 系统缺 ffprobe / 非媒体 / 探针失败 → 一律返回 null(诚实空,绝不填假值,好过假的「1 秒」)。
interface ProbedMedia {
  durationMs: number | null;
  width: number | null;
  height: number | null;
}
const EMPTY_PROBE: ProbedMedia = { durationMs: null, width: null, height: null };

async function locateFfprobe(): Promise<string | null> {
  try {
    return resolveFfprobePath();
  } catch (err) {
    // 元信息探针是可选增强：缺失时维持 null，但把随包损坏/显式配置错误留在诊断日志。
    console.warn(
      `[assets] ffprobe 不可用，媒体时长/尺寸将保持空值: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

function probeMedia(ffprobe: string, absKey: string): Promise<ProbedMedia> {
  return new Promise((resolve) => {
    execFile(
      ffprobe,
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", absKey],
      // [T-372 W5] windowsHide 同上(ffprobe 黑窗抑制;mac/Linux 无操作)。
      { maxBuffer: 8 * 1024 * 1024, timeout: 15000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(EMPTY_PROBE);
        try {
          const j = JSON.parse(stdout) as {
            format?: { duration?: string };
            streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
          };
          const dur = Number(j.format?.duration);
          const v = (j.streams ?? []).find((s) => s.codec_type === "video");
          resolve({
            durationMs: Number.isFinite(dur) && dur > 0 ? Math.round(dur * 1000) : null,
            width: typeof v?.width === "number" ? v.width : null,
            height: typeof v?.height === "number" ? v.height : null,
          });
        } catch {
          resolve(EMPTY_PROBE);
        }
      },
    );
  });
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
    async createPresignedUpload({
      assetType,
      mimeType,
      fileSize,
      accountId,
      folder,
      fileName,
    }) {
      // [T-055d SPEC §7.1] 带 folder+fileName → 用户可见目录 + 原名保真(nextKey 前缀防
      // 重名覆盖,原名仍在末尾完整保留);否则旧规则 assetType/nextKey。fileName 只取
      // basename(路径分隔符剥掉,防注入;blob-security 在 PUT 时还有整链校验)。
      const safeName = fileName
        ? fileName.replace(/[/\\]/g, "_").replace(/^\.+/, "_").slice(0, 120)
        : null;
      // [T-157] 账号分区前缀:两种 key 规则都套 `<accountId ?? _default>/`(数据落盘按号隔离)。
      const prefix = accountKeyPrefix(accountId);
      // [Bug-1 T-014] 不带 folder+fileName 分支,按 mimeType 拼 ext → 磁盘文件有真 ext,
      // Mac Finder / 文件夹预览靠 ext(MIME 没写到文件名 → 系统识别不出);folder+fileName
      // 分支 safeName 已带原名 ext,不再叠(会变 foo.png.png)。unknown mime → 不拼(诚实
      // 不假),由 getDownloadUrl 走 mimeType 兜底补 ext 给下载保存名。
      const ext = !folder || !safeName ? extForMime(mimeType) : null;
      const storageKey =
        folder && safeName
          ? `${prefix}${folder}/${deps.nextKey()}-${safeName}`
          : `${prefix}${assetType}/${deps.nextKey()}${ext ?? ""}`;
      // Validate + resolve the on-disk path (mkdir its parent so the later PUT
      // lands cleanly) and write the sidecar with the declared metadata.
      const absKey = safeJoin(cfg.rootPath, storageKey);
      await fs.mkdir(path.dirname(absKey), { recursive: true });
      const meta: SidecarMeta = {
        mimeType,
        fileSize,
        // [T-296] 尺寸/时长在 create 阶段字节还没上传,无从知道 → 一律 null。
        // 真值由 headObject(complete 阶段,字节已落盘)跑 ffprobe 探出,不再填 1920×1080/1000 假占位。
        width: null,
        height: null,
        durationMs: null,
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
      await fs.writeFile(absKey, bytes);
      // [T-296] 字节已落盘 → 对 media 跑 ffprobe 探真尺寸/时长(缺 ffprobe/非媒体 → null,不填假占位)。
      let probed: ProbedMedia = EMPTY_PROBE;
      if (
        assetType === "image" ||
        assetType === "video" ||
        assetType === "audio"
      ) {
        const ffprobe = await locateFfprobe();
        if (ffprobe) probed = await probeMedia(ffprobe, absKey);
      }
      const meta: SidecarMeta = {
        mimeType,
        fileSize: bytes.byteLength,
        width: probed.width,
        height: probed.height,
        durationMs: probed.durationMs,
      };
      await fs.writeFile(sidecarPath(absKey), JSON.stringify(meta), "utf8");
    },

    async getObject(storageKey) {
      // [T-055h] Server-side read for asset.classify(VLM 看图)。safeJoin 防穿越。
      const absKey = safeJoin(cfg.rootPath, storageKey);
      const buf = await fs.readFile(absKey);
      return new Uint8Array(buf);
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
      // [T-296] complete 阶段字节已落盘 → 对 media 跑 ffprobe 探真时长/尺寸,覆盖 create 阶段的
      //   null 占位(治「录屏时长全显 1 秒」的假占位)。缺 ffprobe/非媒体/探针失败 → 保持 null(诚实)。
      const mime = meta?.mimeType || "";
      let durationMs = meta?.durationMs ?? null;
      let width = meta?.width ?? null;
      let height = meta?.height ?? null;
      if (
        mime.startsWith("video/") ||
        mime.startsWith("audio/") ||
        mime.startsWith("image/")
      ) {
        const ffprobe = await locateFfprobe();
        if (ffprobe) {
          const probed = await probeMedia(ffprobe, absKey);
          durationMs = probed.durationMs;
          if (!mime.startsWith("audio/")) {
            width = probed.width;
            height = probed.height;
          }
        }
      }
      return {
        mimeType: meta?.mimeType || "application/octet-stream",
        fileSize: stat.size,
        checksum,
        width,
        height,
        durationMs,
        mediaMetadata: {},
      } satisfies HeadObjectResult;
    },

    async getSignedUrl(storageKey) {
      const exp = now() + expiresInMs;
      return blobUrl(cfg.publicBaseUrl, storageKey, "GET", exp);
    },
  };
}
