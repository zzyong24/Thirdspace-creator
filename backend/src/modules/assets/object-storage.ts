// Object-storage swap-seam (foundation §4). AssetsService is the ONLY module
// allowed to touch object storage (SPEC §15) — it depends on this port, never a
// concrete client. This wave binds `MockObjectStorage` (in-memory map;
// deterministic fake storageKey + signed URL; no network). The real S3 adapter
// is a stage-N swap with NO domain change: it implements the same port.
//
// Determinism: the mock takes an injected `nextKey`/`now` so every storageKey,
// uploadUrl, and signed URL is reproducible in tests (no Date.now / Math.random
// / crypto). The repository/service layer injects the real clock/id source.

export interface PresignedUpload {
  // Deterministic object key under which the bytes will be stored.
  storageKey: string;
  // Where the client PUTs the bytes (phase 1 of the two-phase upload).
  uploadUrl: string;
}

// [T-157] 账号分区前缀 —— 存储 key 头段 = `<accountId ?? _default>/`,把多账号隔离延伸到
// 存储层(mirror 登录态 `.auth/douyin/<accountId>`)。accountId 是内部 id(acct-.../user-...),
// 仍做 path-safe 收窄(只留 [A-Za-z0-9_-])防目录穿越;空/清洗后为空 → `_default`。
export function accountKeyPrefix(accountId?: string | null): string {
  const seg = (accountId ?? "_default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${seg || "_default"}/`;
}

// Metadata the storage backend reports for an uploaded object (SPEC §20: the
// service validates MIME/size/checksum against this at completeUpload). The mock
// echoes the values recorded at createPresignedUpload time.
export interface HeadObjectResult {
  mimeType: string;
  fileSize: number;
  checksum: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  mediaMetadata: Record<string, unknown>;
}

export interface ObjectStoragePort {
  // Adapter identity is deliberately explicit: maintenance paths such as the
  // T-298 legacy ffprobe backfill are local-fs-only and must never infer the
  // backend from a storageKey (local-fs and S3 intentionally share key shapes).
  readonly kind: "mock" | "local-fs" | "s3";
  // Phase 1: mint a deterministic key + upload URL for an about-to-be-uploaded
  // object. Records the declared metadata so headObject can echo it back.
  createPresignedUpload(input: {
    assetType: string;
    mimeType: string;
    fileSize: number;
    // [T-157] 当前抖音号 —— key 头段按号分区(`<accountId ?? _default>/…`)。可选,
    // 缺省(存量/未选号)回退 `_default`;向后兼容(老 key 不迁移,DB 存每 asset 的 key)。
    accountId?: string | null;
    // [T-055d SPEC §7.1] 目录规则(local-fs):folder 形如 "projects/<safe>-<id6>/素材"
    // 或 "inbox";fileName 原名保真。二者可选 —— 缺省回退旧 key 规则(assetType/nextKey),
    // mock/s3 后端可忽略。
    folder?: string;
    fileName?: string;
  }): Promise<PresignedUpload>;
  // SERVER-SIDE direct write (L5 asset.generate / SPEC 2026-07-01 §3「直写」): store
  // bytes the SERVER already holds (an AI-generated image/video), under a key minted by
  // createPresignedUpload. The two-phase presigned flow is for CLIENT uploads (the browser
  // PUTs its own bytes); a background runner has the bytes in-process and must NOT round-
  // trip through the token-gated HTTP blob route. This keeps AssetsService the SOLE storage
  // caller (SPEC §15) — no leaky `fs.writeFile` in the runner. Records/refreshes the sidecar
  // metadata so a subsequent headObject echoes the real MIME + on-disk byte size.
  putObject(input: {
    storageKey: string;
    bytes: Uint8Array;
    mimeType: string;
    assetType: string;
  }): Promise<void>;
  // Best-effort cleanup for an uploaded object that was found to be an exact
  // byte-for-byte duplicate of an existing asset during phase 2.  The database
  // asset is reused; the just-uploaded temporary object must not become an
  // orphan.  Optional keeps third-party/test adapters source-compatible.
  deleteObject?(storageKey: string): Promise<void>;
  // Inspect a stored object's metadata (phase-2 validation source).
  headObject(storageKey: string): Promise<HeadObjectResult>;
  // [T-055h asset.classify] SERVER-SIDE read: fetch the stored bytes for a key the
  // service already owns (VLM 归类要看图)。与 putObject 对称;keeps AssetsService
  // the SOLE storage caller —— runner 经 service 端口拿字节,不直接 fs.readFile。
  getObject(storageKey: string): Promise<Uint8Array>;
  // A short-lived, read-only signed URL for download / copy-link. Never logged
  // (SPEC §20). Deterministic in the mock so download/copy-link tests are stable.
  getSignedUrl(storageKey: string): Promise<string>;
}

export interface MockObjectStorageDeps {
  // Deterministic key generator (injected; no crypto/Math.random). Called once
  // per createPresignedUpload.
  nextKey: () => string;
}

// In-memory object store. `createPresignedUpload` records the declared metadata
// keyed by the minted storageKey so a later `headObject` echoes it back (this
// stands in for the real backend having actually received + introspected the
// bytes). Pre-seeded keys (the canonical fixture's storageKeys) resolve to a
// generic object so download/copy-link of seeded assets returns a signed URL.
export function createMockObjectStorage(
  deps: MockObjectStorageDeps,
): ObjectStoragePort {
  const objects = new Map<string, HeadObjectResult>();

  return {
    kind: "mock",
    async createPresignedUpload({ assetType, mimeType, fileSize, accountId }) {
      // [T-157] 账号分区:key 头段 = <accountId ?? _default>(mock 键也分区,让集成测试
      // 看到与真实后端一致的按号 key 形状)。
      const storageKey = `${accountKeyPrefix(accountId)}${deps.nextKey()}`;
      objects.set(storageKey, {
        mimeType,
        fileSize,
        checksum: `mock-checksum-${storageKey}`,
        // Image/video carry deterministic placeholder dimensions; others null.
        width: assetType === "image" || assetType === "video" ? 1920 : null,
        height: assetType === "image" || assetType === "video" ? 1080 : null,
        durationMs:
          assetType === "video" || assetType === "audio" ? 1000 : null,
        mediaMetadata: {},
      });
      return {
        storageKey,
        uploadUrl: `mock://object-storage/upload/${storageKey}`,
      };
    },

    async putObject({ storageKey, bytes, mimeType, assetType }) {
      // Server-side direct write — record the real byte length + declared MIME so a
      // later headObject echoes them (stands in for the backend having received bytes).
      objects.set(storageKey, {
        mimeType,
        fileSize: bytes.byteLength,
        checksum: `mock-checksum-${storageKey}`,
        width: assetType === "image" || assetType === "video" ? 1920 : null,
        height: assetType === "image" || assetType === "video" ? 1080 : null,
        durationMs:
          assetType === "video" || assetType === "audio" ? 1000 : null,
        mediaMetadata: {},
      });
    },

    async getObject() {
      // Mock:无真字节(测试里 asset.classify 用 fake registry,不读真图)。
      return new Uint8Array(0);
    },

    async deleteObject(storageKey) {
      objects.delete(storageKey);
    },

    async headObject(storageKey) {
      const existing = objects.get(storageKey);
      if (existing) return existing;
      // Unknown key (e.g. a seeded fixture storageKey, or a key passed straight
      // to assets.files.create) → a deterministic generic object. The bytes are
      // assumed present (the mock never reaches the network); the real adapter
      // would 404 here, surfacing as an UploadValidationError upstream.
      return {
        mimeType: "application/octet-stream",
        fileSize: 0,
        checksum: `mock-checksum-${storageKey}`,
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      };
    },

    async getSignedUrl(storageKey) {
      // Deterministic, short-lived signed URL. The ?sig token is a stable mock
      // (never a real secret) so tests can assert on it; the real adapter mints
      // an expiring signature. Never logged (SPEC §20).
      return `mock://object-storage/signed/${storageKey}?sig=mock`;
    },
  };
}
