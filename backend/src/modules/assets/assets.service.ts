import type { RequestContext } from "@creatoros/contract";
import type {
  AssetRepository,
  AssetRow,
  AssetFileRow,
  MaterialLinkRow,
  ListAssetsQuery,
} from "./assets.repository";
import type { ObjectStoragePort } from "./object-storage";
import type { RepoDeps } from "./assets.repository";
import {
  OwnershipError,
  InvalidTransitionError,
  ConflictError,
  UploadValidationError,
} from "./assets.errors";

// Assets service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into the user-scoped repository (foundation §2). It is the ONLY
// object-storage caller (SPEC §15) and the SOLE owner of the §12 lifecycle state
// machine (the repository never transitions on its own):
//
//   active ↔ archived
//   active  → deleted   (trash; stamps deletedAt = clock.now())
//   deleted → active    (restore; clears deletedAt)
//
// Upload is two-phase (SPEC §15): createUpload (phase 1) mints a presigned key +
// persists a `created` session; completeUpload (phase 2) validates the object
// (SPEC §20) and materializes the Asset + first AssetFile, linking currentFileId.
// No cross-module repo import.

// Valid upload asset types (contract primitives `assetType` enum). Kept local so
// createUpload can reject a bad type as an UploadValidationError without importing
// zod into this layer.
const ASSET_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
  "subtitle",
]);

export interface AssetUploadDto {
  uploadId: string;
  storageKey: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface AssetsService {
  listAssets(ctx: RequestContext, query: ListAssetsQuery): Promise<AssetRow[]>;
  getAsset(ctx: RequestContext, assetId: string): Promise<AssetRow>;
  createUpload(
    ctx: RequestContext,
    input: {
      assetType: string;
      mimeType: string;
      fileSize: number;
      // [T-055d SPEC §7.1] 目录规则:projectId → projects/<safe>-<id6>/素材;缺省 → inbox。
      projectId?: string;
      fileName?: string;
    },
  ): Promise<AssetUploadDto>;
  completeUpload(
    ctx: RequestContext,
    uploadId: string,
    input: { name: string },
  ): Promise<AssetRow>;
  // [T-055d SPEC §7.2] 下载 = 复制:当前文件的签名 GET URL(local-fs = token 门 blob
  // route;s3 = presigned GET)+ 建议保存名(原名保真:storageKey 末段)。
  getDownloadUrl(
    ctx: RequestContext,
    assetId: string,
  ): Promise<{ url: string; fileName: string }>;
  // L5 asset.generate (SPEC 2026-07-01 §3) — the SERVER-SIDE counterpart to the two-phase
  // client upload: an AI-generated image/video whose bytes the runner already holds. Mints
  // a storage key, direct-writes the bytes (storage.putObject — NOT the presigned client
  // flow), then materializes the Asset + first AssetFile in ONE call (no separate uploadId
  // session). The asset is born 'active' but UNBOUND to any project — the AI confirm门 ties
  // it into the 用料链 on 采纳 (铁律②:AI 只产候选、人采纳). Keeps AssetsService the SOLE
  // object-storage caller (SPEC §15).
  createGeneratedAsset(
    ctx: RequestContext,
    input: {
      assetType: string;
      name: string;
      bytes: Uint8Array;
      mimeType: string;
    },
  ): Promise<AssetRow>;
  addAssetFile(
    ctx: RequestContext,
    assetId: string,
    input: { storageKey: string },
  ): Promise<AssetFileRow>;
  trashAsset(ctx: RequestContext, assetId: string): Promise<AssetRow>;
  restoreAsset(ctx: RequestContext, assetId: string): Promise<AssetRow>;
  toggleFavorite(ctx: RequestContext, assetId: string): Promise<AssetRow>;
  listAssetUsage(
    ctx: RequestContext,
    assetId: string,
  ): Promise<MaterialLinkRow[]>;
  archiveAsset(ctx: RequestContext, assetId: string): Promise<AssetRow>;
  unarchiveAsset(ctx: RequestContext, assetId: string): Promise<AssetRow>;
}

// The per-ctx object-storage factory (item B). AssetsService no longer holds a
// singleton storage adapter: each storage-touching method resolves the adapter
// for the request's ctx (the composition layer reads that user's storage_config →
// S3 when backend='s3' + env present, else local-fs at the user's resolved root).
// This keeps AssetsService the SOLE object-storage caller (SPEC §15) while making
// the backend a per-user choice.
export type ObjectStorageForCtx = (
  ctx: RequestContext,
) => Promise<ObjectStoragePort>;

export function createAssetsService(
  repo: AssetRepository,
  objectStorageForCtx: ObjectStorageForCtx,
  deps: RepoDeps & {
    // [T-055d SPEC §7.1] 项目目录名解析端口(composition root 绑 projects public service,
    // 含归属校验):projectId → "projects/<safe-title>-<id6>";未知/越权项目 → null(落 inbox)。
    // 可选:旧装配缺省 → 全部走旧 key 规则(assetType/nextKey),行为不变。
    resolveProjectFolder?: (
      ctx: RequestContext,
      projectId: string,
    ) => Promise<string | null>;
  },
): AssetsService {
  // Load an owned asset or raise OwnershipError (404, no existence leak).
  async function requireAsset(
    ctx: RequestContext,
    assetId: string,
  ): Promise<AssetRow> {
    const row = await repo.getAsset(ctx.userId, assetId);
    if (!row) throw new OwnershipError("Asset not found");
    return row;
  }

  return {
    async listAssets(ctx, query) {
      return repo.listAssets(ctx.userId, query);
    },

    async getAsset(ctx, assetId) {
      return requireAsset(ctx, assetId);
    },

    async getDownloadUrl(ctx, assetId) {
      const asset = await requireAsset(ctx, assetId);
      const files = await repo.listAssetFiles(ctx.userId, assetId);
      const current =
        files.find((f) => f.id === asset.currentFileId) ??
        files[files.length - 1];
      if (!current) {
        throw new OwnershipError("Asset has no file");
      }
      const storage = await objectStorageForCtx(ctx);
      const url = await storage.getSignedUrl(current.storageKey);
      // 保存名:storageKey 末段(local-fs 目录规则下含原名);剥 nextKey 前缀。
      const base = current.storageKey.split("/").pop() ?? "download";
      const fileName = base.replace(/^asset-key-\d+-/, "");
      return { url, fileName };
    },
    async createUpload(ctx, input) {
      // SPEC §20 input validation (phase 1).
      if (!ASSET_TYPES.has(input.assetType)) {
        throw new UploadValidationError(`Invalid assetType: ${input.assetType}`);
      }
      if (!input.mimeType || input.mimeType.trim() === "") {
        throw new UploadValidationError("mimeType is required");
      }
      if (!(input.fileSize > 0)) {
        throw new UploadValidationError("fileSize must be positive");
      }
      const storage = await objectStorageForCtx(ctx);
      // [T-055d SPEC §7.1] 目录规则:带 projectId → projects/<safe>-<id6>/素材(经
      // resolveProjectFolder 端口,含归属校验);不带 → inbox。端口缺省(旧装配)→ 旧 key 规则。
      const folder = input.projectId
        ? await deps.resolveProjectFolder?.(ctx, input.projectId).then(
            (dir) => (dir ? `${dir}/素材` : undefined),
          )
        : deps.resolveProjectFolder
          ? "inbox"
          : undefined;
      const { storageKey, uploadUrl } = await storage.createPresignedUpload({
        assetType: input.assetType,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        folder: folder ?? undefined,
        fileName: input.fileName,
      });
      const expiresAt = deps.now();
      const session = await repo.createUploadSession(ctx.userId, {
        assetType: input.assetType,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        storageKey,
        expiresAt,
      });
      return {
        uploadId: session.id,
        storageKey: session.storageKey,
        uploadUrl,
        expiresAt: session.expiresAt,
      };
    },

    async completeUpload(ctx, uploadId, input) {
      // Load the session scoped to the ctx user (foreign/unknown → 404).
      const session = await repo.getUploadSession(ctx.userId, uploadId);
      if (!session) throw new OwnershipError("Upload session not found");
      // Idempotency guard: a session is single-use (created → completed).
      if (session.status !== "created") {
        throw new ConflictError("Upload session already completed");
      }
      // SPEC §20: validate the stored object's MIME/size/checksum via headObject.
      const storage = await objectStorageForCtx(ctx);
      const head = await storage.headObject(session.storageKey);
      // Materialize: create the asset (active), then the first file (v1), then
      // re-point currentFileId. The repo stamps userId + status='active'.
      const asset = await repo.insertAsset(ctx.userId, {
        assetType: session.assetType,
        name: input.name,
        currentFileId: null,
      });
      const file = await repo.insertAssetFile(ctx.userId, {
        assetId: asset.id,
        storageKey: session.storageKey,
        mimeType: head.mimeType || session.mimeType,
        fileSize: head.fileSize || session.fileSize,
        checksum: head.checksum,
        width: head.width,
        height: head.height,
        durationMs: head.durationMs,
        mediaMetadata: head.mediaMetadata,
      });
      const updated = await repo.updateAssetStatus(ctx.userId, asset.id, {
        currentFileId: file.id,
      });
      await repo.markUploadCompleted(ctx.userId, uploadId);
      return updated ?? asset;
    },

    async createGeneratedAsset(ctx, input) {
      // SPEC §20 input validation (mirror createUpload phase 1).
      if (!ASSET_TYPES.has(input.assetType)) {
        throw new UploadValidationError(`Invalid assetType: ${input.assetType}`);
      }
      if (!input.mimeType || input.mimeType.trim() === "") {
        throw new UploadValidationError("mimeType is required");
      }
      if (!(input.bytes.byteLength > 0)) {
        throw new UploadValidationError("generated asset has no bytes");
      }
      const storage = await objectStorageForCtx(ctx);
      // Mint a key exactly like the presigned path would (assetType-prefixed) so the
      // on-disk / bucket layout is identical to a client upload.
      const { storageKey } = await storage.createPresignedUpload({
        assetType: input.assetType,
        mimeType: input.mimeType,
        fileSize: input.bytes.byteLength,
      });
      // Direct-write the in-process bytes (the runner already generated them) — no HTTP
      // blob-route round-trip. Then head the object to get the authoritative size/checksum.
      await storage.putObject({
        storageKey,
        bytes: input.bytes,
        mimeType: input.mimeType,
        assetType: input.assetType,
      });
      const head = await storage.headObject(storageKey);
      // Materialize: asset (active) → first file (v1) → re-point currentFileId (mirror
      // completeUpload). The repo stamps userId + status='active'.
      const asset = await repo.insertAsset(ctx.userId, {
        assetType: input.assetType,
        name: input.name,
        currentFileId: null,
      });
      const file = await repo.insertAssetFile(ctx.userId, {
        assetId: asset.id,
        storageKey,
        mimeType: head.mimeType || input.mimeType,
        fileSize: head.fileSize || input.bytes.byteLength,
        checksum: head.checksum,
        width: head.width,
        height: head.height,
        durationMs: head.durationMs,
        mediaMetadata: head.mediaMetadata,
      });
      const updated = await repo.updateAssetStatus(ctx.userId, asset.id, {
        currentFileId: file.id,
      });
      return updated ?? asset;
    },

    async addAssetFile(ctx, assetId, input) {
      // Verify ownership (C2) before touching storage/repo.
      await requireAsset(ctx, assetId);
      const storage = await objectStorageForCtx(ctx);
      const head = await storage.headObject(input.storageKey);
      const file = await repo.insertAssetFile(ctx.userId, {
        assetId,
        storageKey: input.storageKey,
        mimeType: head.mimeType,
        fileSize: head.fileSize,
        checksum: head.checksum,
        width: head.width,
        height: head.height,
        durationMs: head.durationMs,
        mediaMetadata: head.mediaMetadata,
      });
      // Advance currentFileId to the new file (the favorite/version affordance).
      await repo.updateAssetStatus(ctx.userId, assetId, {
        currentFileId: file.id,
      });
      return file;
    },

    async trashAsset(ctx, assetId) {
      const asset = await requireAsset(ctx, assetId);
      if (asset.status !== "active") {
        throw new InvalidTransitionError(
          `Cannot trash an asset in status '${asset.status}'`,
        );
      }
      const updated = await repo.updateAssetStatus(ctx.userId, assetId, {
        status: "deleted",
        deletedAt: deps.now(),
      });
      return updated!;
    },

    async restoreAsset(ctx, assetId) {
      const asset = await requireAsset(ctx, assetId);
      if (asset.status !== "deleted") {
        throw new InvalidTransitionError(
          `Cannot restore an asset in status '${asset.status}'`,
        );
      }
      const updated = await repo.updateAssetStatus(ctx.userId, assetId, {
        status: "active",
        deletedAt: null,
      });
      return updated!;
    },

    async toggleFavorite(ctx, assetId) {
      // 收藏翻转 (mirror trashAsset's load→update shape). 收藏 is orthogonal to the
      // §12 status machine, so there is NO transition guard — any owned asset can
      // be (un)favorited. Flips the current isFavorite and re-reads the row.
      const asset = await requireAsset(ctx, assetId);
      const updated = await repo.updateAssetStatus(ctx.userId, assetId, {
        isFavorite: !asset.isFavorite,
      });
      return updated!;
    },

    async listAssetUsage(ctx, assetId) {
      // 用料反查: assert ownership first (foreign/unknown → 404, no leak), then
      // return the 用料链 edges that reference this asset.
      await requireAsset(ctx, assetId);
      return repo.listAssetUsage(ctx.userId, assetId);
    },

    async archiveAsset(ctx, assetId) {
      // §12 active ↔ archived. No FE wiring yet; exists to satisfy the state
      // machine completeness (plan C8).
      const asset = await requireAsset(ctx, assetId);
      if (asset.status !== "active") {
        throw new InvalidTransitionError(
          `Cannot archive an asset in status '${asset.status}'`,
        );
      }
      const updated = await repo.updateAssetStatus(ctx.userId, assetId, {
        status: "archived",
      });
      return updated!;
    },

    async unarchiveAsset(ctx, assetId) {
      const asset = await requireAsset(ctx, assetId);
      if (asset.status !== "archived") {
        throw new InvalidTransitionError(
          `Cannot unarchive an asset in status '${asset.status}'`,
        );
      }
      const updated = await repo.updateAssetStatus(ctx.userId, assetId, {
        status: "active",
      });
      return updated!;
    },
  };
}
