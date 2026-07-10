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
import { extForFileName, extForMime } from "../../lib/mime-ext";

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

// [T-146 切片 a · gate 处置·大文件兜底] 文档上传大小上限(20MB)。文档要走文本抽取 + AI 摘要,
// 超大文档抽取会 OOM/超 context;后端在 createUpload 硬拒(前端 accept 只是提示,不可信)。仅
// 卡 document 类型(图/视/音走各自媒体链,不受此限)。
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export interface AssetUploadDto {
  uploadId: string;
  storageKey: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface AssetsService {
  // [T-200] 认领存量无号 assets 给 ctx.accountId(修采集封面/素材在无号 ctx 下落的 null 号 →
  //   读侧严格 eq gate 排除 → 占位的根因)。幂等;ctx.accountId 缺省 → no-op(返回 0)。返回改动行数。
  claimOrphanAssets(ctx: RequestContext): Promise<number>;
  listAssets(ctx: RequestContext, query: ListAssetsQuery): Promise<AssetRow[]>;
  /** [T-061] Batch-read current files for the list/get 投影(ids 来自 user-scoped rows)。 */
  listFilesByIds(ctx: RequestContext, fileIds: string[]): Promise<AssetFileRow[]>;
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
  // [T-055h asset.classify] VLM 归类的两个端口:读当前文件字节(看图)+ 回写 AI 注解
  // (一句话描述进 mediaMetadata.aiDescription)。runner 经这里,service 仍是唯一 storage 调用方。
  getAssetBytes(
    ctx: RequestContext,
    assetId: string,
  ): Promise<{ bytes: Uint8Array; mimeType: string } | null>;
  mergeAiAnnotation(
    ctx: RequestContext,
    assetId: string,
    patch: Record<string, unknown>,
  ): Promise<void>;
  // [T-146 切片 a] 文档抽取的两个回写端口:落全文/状态列(updateFileExtraction)+ 落要点卡
  // (走 mergeAiAnnotation 的 jsonb merge,materialSummary 键)。runner 经这里,service 仍是
  // 唯一 storage/repo 调用方。
  updateFileExtraction(
    ctx: RequestContext,
    assetId: string,
    patch: { extractedText?: string | null; extractStatus?: string },
  ): Promise<void>;
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
    const row = await repo.getAsset(ctx.userId, assetId, ctx.accountId ?? null);
    if (!row) throw new OwnershipError("Asset not found");
    return row;
  }

  return {
    async claimOrphanAssets(ctx) {
      if (!ctx.accountId) return 0; // 未选号:无号可认领
      return repo.claimOrphanAssets(ctx.userId, ctx.accountId);
    },

    async listAssets(ctx, query) {
      return repo.listAssets(ctx.userId, query, ctx.accountId ?? null);
    },

    async listFilesByIds(_ctx, fileIds) {
      return repo.listFilesByIds(fileIds);
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
      // [Bug-1 T-014] 兜底:旧 key 末段可能没 ext(早期版本 nextKey() 不拼 ext) →
      // extForFileName 抽不到 → 从 current.mimeType 推 ext 补上,让浏览器保存到本地能识别。
      const base = current.storageKey.split("/").pop() ?? "download";
      const stripped = base.replace(/^asset-key-\d+-/, "");
      const existingExt = extForFileName(stripped);
      const fileName =
        existingExt ?? stripped + (extForMime(current.mimeType) ?? "");
      return { url, fileName };
    },
    async getAssetBytes(ctx, assetId) {
      await requireAsset(ctx, assetId);
      const files = await repo.listAssetFiles(ctx.userId, assetId);
      const current = files[files.length - 1];
      if (!current) return null;
      const storage = await objectStorageForCtx(ctx);
      const bytes = await storage.getObject(current.storageKey);
      if (!bytes || bytes.byteLength === 0) return null;
      return { bytes, mimeType: current.mimeType };
    },

    async mergeAiAnnotation(ctx, assetId, patch) {
      await requireAsset(ctx, assetId);
      await repo.mergeFileMetadata(ctx.userId, assetId, patch);
    },

    async updateFileExtraction(ctx, assetId, patch) {
      await requireAsset(ctx, assetId);
      await repo.updateFileExtraction(ctx.userId, assetId, patch);
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
      // [T-146 切片 a · gate 大文件兜底] 文档超 20MB 硬拒(抽取/摘要会 OOM/超 context)。
      if (
        input.assetType === "document" &&
        input.fileSize > MAX_DOCUMENT_BYTES
      ) {
        throw new UploadValidationError(
          `文档超过 20MB 上限(${(input.fileSize / 1024 / 1024).toFixed(1)}MB),无法自动解析,请拆分后再传`,
        );
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
        // [T-157] 存储 key 按当前抖音号分区(未选号 → _default);向后兼容。
        accountId: ctx.accountId ?? null,
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
      const asset = await repo.insertAsset(
        ctx.userId,
        {
          assetType: session.assetType,
          name: input.name,
          currentFileId: null,
        },
        ctx.accountId ?? null,
      );
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
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        asset.id,
        {
          currentFileId: file.id,
        },
        ctx.accountId ?? null,
      );
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
        // [T-157] 服务端直写(采集封面/AI 生成)同样按当前号分区,与客户端上传布局一致。
        accountId: ctx.accountId ?? null,
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
      const asset = await repo.insertAsset(
        ctx.userId,
        {
          assetType: input.assetType,
          name: input.name,
          currentFileId: null,
        },
        ctx.accountId ?? null,
      );
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
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        asset.id,
        {
          currentFileId: file.id,
        },
        ctx.accountId ?? null,
      );
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
      await repo.updateAssetStatus(
        ctx.userId,
        assetId,
        {
          currentFileId: file.id,
        },
        ctx.accountId ?? null,
      );
      return file;
    },

    async trashAsset(ctx, assetId) {
      const asset = await requireAsset(ctx, assetId);
      if (asset.status !== "active") {
        throw new InvalidTransitionError(
          `Cannot trash an asset in status '${asset.status}'`,
        );
      }
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        assetId,
        {
          status: "deleted",
          deletedAt: deps.now(),
        },
        ctx.accountId ?? null,
      );
      return updated!;
    },

    async restoreAsset(ctx, assetId) {
      const asset = await requireAsset(ctx, assetId);
      if (asset.status !== "deleted") {
        throw new InvalidTransitionError(
          `Cannot restore an asset in status '${asset.status}'`,
        );
      }
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        assetId,
        {
          status: "active",
          deletedAt: null,
        },
        ctx.accountId ?? null,
      );
      return updated!;
    },

    async toggleFavorite(ctx, assetId) {
      // 收藏翻转 (mirror trashAsset's load→update shape). 收藏 is orthogonal to the
      // §12 status machine, so there is NO transition guard — any owned asset can
      // be (un)favorited. Flips the current isFavorite and re-reads the row.
      const asset = await requireAsset(ctx, assetId);
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        assetId,
        {
          isFavorite: !asset.isFavorite,
        },
        ctx.accountId ?? null,
      );
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
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        assetId,
        {
          status: "archived",
        },
        ctx.accountId ?? null,
      );
      return updated!;
    },

    async unarchiveAsset(ctx, assetId) {
      const asset = await requireAsset(ctx, assetId);
      if (asset.status !== "archived") {
        throw new InvalidTransitionError(
          `Cannot unarchive an asset in status '${asset.status}'`,
        );
      }
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        assetId,
        {
          status: "active",
        },
        ctx.accountId ?? null,
      );
      return updated!;
    },
  };
}
