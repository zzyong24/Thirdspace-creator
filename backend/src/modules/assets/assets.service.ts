import { createHash } from "node:crypto";
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
  UploadValidationError,
  requireAccountId,
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

// [T-298] 素材库 list 的懒回填每批最多探 5 条，串行执行，避免一次打开页面
// 拉起大量 ffprobe。进程内集合只做并发去重；真正的幂等由 repository 的旧签名
// 条件更新 + 持久 marker 保证。
const LEGACY_MEDIA_BACKFILL_BATCH_SIZE = 5;

// [T-146 切片 a · gate 处置·大文件兜底] 文档上传大小上限(20MB)。文档要走文本抽取 + AI 摘要,
// 超大文档抽取会 OOM/超 context;后端在 createUpload 硬拒(前端 accept 只是提示,不可信)。仅
// 卡 document 类型(图/视/音走各自媒体链,不受此限)。
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export interface AssetUploadDto {
  uploadId: string;
  assetId: string;
  storageKey: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface AssetsService {
  // [T-332 S2] claimOrphanAssets 已随 claimOrphans 全链退役(SPEC §4.4):清库世界没有
  //   孤儿,采集/AI 生成的 asset 出生即带号。所有经 ctx 的入口(读+写)统一断言
  //   requireAccountId(§4.2 未选号=引导态禁读写);唯一例外是 createUpload(asset_uploads
  //   临时会话 user 级,C-08 裁决),账号断言在确认落 assets 的 completeUpload。
  listAssets(ctx: RequestContext, query: ListAssetsQuery): Promise<AssetRow[]>;
  /** [T-061] Batch-read current files for the list/get 投影(ids 来自 user-scoped rows)。 */
  listFilesByIds(ctx: RequestContext, fileIds: string[]): Promise<AssetFileRow[]>;
  getAsset(ctx: RequestContext, assetId: string): Promise<AssetRow>;
  /**
   * [T-251] 按来源 URL 反查最近一条 document 类 asset(pending/active 都算)—— web.read
   * 「重读同 URL 不重新抓取」的读点。查不到 → null(诚实,不抛)。
   */
  findAssetBySourceUrl(
    ctx: RequestContext,
    sourceUrl: string,
  ): Promise<AssetRow | null>;
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
  /**
   * 服务端已有字节的一次性下载产物：只写对象存储并换短时签名 URL，不创建
   * assets / asset_files 行。素材包、诊断包等非创作容器必须走此端口。
   */
  createTemporaryDownload(
    ctx: RequestContext,
    input: { name: string; bytes: Uint8Array; mimeType: string },
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
      // [T-219] 待确认落库:截图端口传 true → asset 生为 'pending'(不进素材库 list),由对话
      //   确认门 commitPendingAsset 翻 active 才入库。缺省 false = 生 active(封面回填 / AI 生成
      //   素材等既有直落场景不变)。
      pending?: boolean;
      /**
       * 服务端稳定幂等键（不接受浏览器输入）。execution adoption 传 task+artifact 派生值；
       * 相同 user/account/key 永远映射到同一 assets.id。
       */
      idempotencyKey?: string;
    },
  ): Promise<AssetRow>;
  // [T-219] 确认门:把某 pending asset 翻 active 进素材库 + stamp 当前号(ctx.accountId)。
  //   非 pending / 越权 / 不存在 → OwnershipError(404)。铁律②:AI 只落 pending,人确认才进库。
  commitPendingAsset(ctx: RequestContext, assetId: string): Promise<AssetRow>;
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
  const legacyMediaBackfillInFlight = new Set<string>();

  // Load an owned asset or raise OwnershipError (404, no existence leak).
  // [T-332 S2] by-id 读叠「号一致性门」(SPEC §4.5):未选号 → AccountRequiredError
  // (引导态);跨号 asset → 与不存在同貌 404(strict 世界里别号内容就该不存在)。
  async function requireAsset(
    ctx: RequestContext,
    assetId: string,
  ): Promise<AssetRow> {
    const accountId = requireAccountId(ctx.accountId, "assets.getAsset");
    const row = await repo.getAsset(ctx.userId, assetId, accountId);
    if (!row) throw new OwnershipError("Asset not found");
    return row;
  }

  async function backfillLegacyMediaMetadata(
    ctx: RequestContext,
    ownedAssets: AssetRow[],
    accountId: string,
  ): Promise<void> {
    const currentFileIds = ownedAssets
      .map((asset) => asset.currentFileId)
      .filter((id): id is string => typeof id === "string");
    if (currentFileIds.length === 0) return;
    const files = await repo.listFilesByIds(currentFileIds);
    const fileById = new Map(files.map((file) => [file.id, file]));
    const candidates = ownedAssets
      .filter((asset) => asset.assetType === "video")
      .flatMap((asset) => {
        const file = asset.currentFileId
          ? fileById.get(asset.currentFileId)
          : undefined;
        if (!file) return [];
        const metadata =
          (file.mediaMetadata as Record<string, unknown> | null) ?? {};
        if (
          file.mimeType.startsWith("video/") &&
          file.durationMs === 1000 &&
          file.width === 1920 &&
          metadata["legacyMediaProbeBackfilledAt"] === undefined
        ) {
          return [{ asset, file }];
        }
        return [];
      })
      .filter(
        ({ file }) =>
          !legacyMediaBackfillInFlight.has(
            `${ctx.userId}:${accountId}:${file.id}`,
          ),
      )
      .slice(0, LEGACY_MEDIA_BACKFILL_BATCH_SIZE);
    if (candidates.length === 0) return;
    // 在任何下一次 await 之前先预占，两个并发 list 请求就不会同时选中同一文件。
    for (const { file } of candidates) {
      legacyMediaBackfillInFlight.add(
        `${ctx.userId}:${accountId}:${file.id}`,
      );
    }

    // objectStorageForCtx 是唯一合法的存储装配口；kind 明确限制为 local-fs，
    // 不猜 key 形状、不对 S3/mock 发昂贵或无意义的媒体探针。
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const storage = await objectStorageForCtx(ctx);
      if (storage.kind !== "local-fs") return;
      for (const { asset, file } of candidates) {
        try {
          const head = await storage.headObject(file.storageKey);
          // 探针失败时 local-fs headObject 诚实返回 null。保留旧签名让后续 list
          // 有机会重试，不用 null 把一次瞬时失败固化成永不自愈。
          if (
            !Number.isFinite(head.durationMs) ||
            (head.durationMs ?? 0) <= 0 ||
            !Number.isFinite(head.width) ||
            (head.width ?? 0) <= 0 ||
            !Number.isFinite(head.height) ||
            (head.height ?? 0) <= 0
          ) {
            failed += 1;
            continue;
          }
          const didUpdate = await repo.backfillLegacyMediaMetadata(
            ctx.userId,
            asset.id,
            file.id,
            {
              durationMs: head.durationMs!,
              width: head.width!,
              height: head.height!,
              backfilledAt: deps.now(),
            },
            accountId,
          );
          if (didUpdate) updated += 1;
          else skipped += 1;
        } catch (error) {
          failed += 1;
          console.warn("[assets][T-298] legacy-media-backfill-item-failed", {
            accountId,
            assetId: asset.id,
            fileId: file.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      console.info("[assets][T-298] legacy-media-backfill", {
        accountId,
        eligible: candidates.length,
        updated,
        skipped,
        failed,
      });
    } finally {
      for (const { file } of candidates) {
        legacyMediaBackfillInFlight.delete(
          `${ctx.userId}:${accountId}:${file.id}`,
        );
      }
    }
  }

  return {
    async commitPendingAsset(ctx, assetId) {
      // pending → active(确认门经 dispatch route,ctx 带 x-account-id 校验后的号)。
      // [T-332 S2] 确认门二次校验(SPEC §4.6):repo WHERE 叠账号门,跨号 pending → null → 404。
      const row = await repo.commitPendingAsset(
        ctx.userId,
        assetId,
        requireAccountId(ctx.accountId, "assets.commitPendingAsset"),
      );
      if (!row) throw new OwnershipError("Asset not found"); // 非 pending / 越权 / 跨号 / 不存在
      return row;
    },

    async listAssets(ctx, query) {
      const accountId = requireAccountId(ctx.accountId, "assets.listAssets");
      const rows = await repo.listAssets(
        ctx.userId,
        query,
        accountId,
      );
      // 不阻塞素材库响应/应用启动。所有错误在这里收口成可观测日志；
      // 后台方法内部仍只经 account-scoped repository + per-ctx storage port。
      void backfillLegacyMediaMetadata(ctx, rows, accountId).catch((error) => {
        console.warn("[assets][T-298] legacy-media-backfill-failed", {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      return rows;
    },

    async listFilesByIds(ctx, fileIds) {
      // ids 来自已按号过滤的 asset 行(list/get 投影),这里仍统一断言引导态语义。
      requireAccountId(ctx.accountId, "assets.listFilesByIds");
      return repo.listFilesByIds(fileIds);
    },

    async getAsset(ctx, assetId) {
      return requireAsset(ctx, assetId);
    },

    async findAssetBySourceUrl(ctx, sourceUrl) {
      return repo.findAssetBySourceUrl(
        ctx.userId,
        sourceUrl,
        requireAccountId(ctx.accountId, "assets.findAssetBySourceUrl"),
      );
    },

    async getDownloadUrl(ctx, assetId) {
      const accountId = requireAccountId(ctx.accountId, "assets.getDownloadUrl");
      const asset = await requireAsset(ctx, assetId);
      const files = await repo.listAssetFiles(ctx.userId, assetId, accountId);
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
      const accountId = requireAccountId(ctx.accountId, "assets.getAssetBytes");
      await requireAsset(ctx, assetId);
      const files = await repo.listAssetFiles(ctx.userId, assetId, accountId);
      const current = files[files.length - 1];
      if (!current) return null;
      const storage = await objectStorageForCtx(ctx);
      const bytes = await storage.getObject(current.storageKey);
      if (!bytes || bytes.byteLength === 0) return null;
      return { bytes, mimeType: current.mimeType };
    },

    async mergeAiAnnotation(ctx, assetId, patch) {
      const accountId = requireAccountId(ctx.accountId, "assets.mergeAiAnnotation");
      await requireAsset(ctx, assetId);
      await repo.mergeFileMetadata(ctx.userId, assetId, patch, accountId);
    },

    async updateFileExtraction(ctx, assetId, patch) {
      const accountId = requireAccountId(
        ctx.accountId,
        "assets.updateFileExtraction",
      );
      await requireAsset(ctx, assetId);
      await repo.updateFileExtraction(ctx.userId, assetId, patch, accountId);
    },

    async createUpload(ctx, input) {
      const accountId = requireAccountId(ctx.accountId, "assets.createUpload");
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
        accountId,
        folder: folder ?? undefined,
        fileName: input.fileName,
      });
      const expiresAt = deps.now();
      const assetId = deps.nextId("asset");
      const session = await repo.createUploadSession(ctx.userId, {
        accountId,
        assetId,
        assetType: input.assetType,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        storageKey,
        expiresAt,
      });
      return {
        uploadId: session.id,
        assetId: session.assetId,
        storageKey: session.storageKey,
        uploadUrl,
        expiresAt: session.expiresAt,
      };
    },

    async completeUpload(ctx, uploadId, input) {
      const accountId = requireAccountId(ctx.accountId, "assets.completeUpload");
      // 上传会话从创建起就绑定账号；换号后与不存在同貌，不能把 A 号上传完成到 B 号。
      const session = await repo.getUploadSession(
        ctx.userId,
        uploadId,
        accountId,
      );
      if (!session) throw new OwnershipError("Upload session not found");
      if (session.status === "completed") {
        const existing = await repo.getAsset(
          ctx.userId,
          session.assetId,
          accountId,
        );
        if (!existing) throw new OwnershipError("Completed asset not found");
        return existing;
      }
      // SPEC §20: validate the stored object's MIME/size/checksum via headObject.
      const storage = await objectStorageForCtx(ctx);
      const head = await storage.headObject(session.storageKey);
      if (head.fileSize !== session.fileSize) {
        throw new UploadValidationError(
          `上传文件不完整：应为 ${session.fileSize} 字节，实际收到 ${head.fileSize} 字节，请重新上传`,
        );
      }
      const asset = await repo.completeUploadSession(
        ctx.userId,
        uploadId,
        accountId,
        {
          name: input.name,
          head,
        },
      );
      if (!asset) throw new OwnershipError("Upload session not found");
      if (asset.id !== session.assetId) {
        // The repository reused an existing byte-identical asset.  Remove the
        // newly uploaded object so dedupe does not leave invisible disk/bucket
        // garbage. Cleanup failure must not corrupt the already-committed asset.
        await storage.deleteObject?.(session.storageKey).catch(() => undefined);
      }
      return asset;
    },

    async createTemporaryDownload(ctx, input) {
      const accountId = requireAccountId(
        ctx.accountId,
        "assets.createTemporaryDownload",
      );
      if (!input.name.trim()) {
        throw new UploadValidationError("download name is required");
      }
      if (!input.mimeType.trim()) {
        throw new UploadValidationError("mimeType is required");
      }
      if (!(input.bytes.byteLength > 0)) {
        throw new UploadValidationError("temporary download has no bytes");
      }

      const storage = await objectStorageForCtx(ctx);
      let storageKey: string | null = null;
      try {
        const created = await storage.createPresignedUpload({
          assetType: "document",
          mimeType: input.mimeType,
          fileSize: input.bytes.byteLength,
          accountId,
          folder: "exports",
          fileName: input.name,
        });
        storageKey = created.storageKey;
        await storage.putObject({
          storageKey,
          bytes: input.bytes,
          mimeType: input.mimeType,
          assetType: "document",
        });
        return {
          url: await storage.getSignedUrl(storageKey),
          fileName: input.name,
        };
      } catch (error) {
        if (storageKey) {
          await storage.deleteObject?.(storageKey).catch(() => undefined);
        }
        throw error;
      }
    },

    async createGeneratedAsset(ctx, input) {
      // [T-332 S2] 服务端直写(采集封面/AI 生成)的落 assets 入口:出生即带号(ISO-03)。
      //   采集/AI 链路的 ctx 账号由绑定/job/ai_task 派生(ISO-06),恒有号,门不误伤。
      const accountId = requireAccountId(
        ctx.accountId,
        "assets.createGeneratedAsset",
      );
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
      const stableKey = input.idempotencyKey?.trim() ?? "";
      const stableAssetId = stableKey
        ? `asset_adopt_${createHash("sha256")
            .update("creatoros-generated-asset-v1\n")
            .update(ctx.userId)
            .update("\n")
            .update(accountId)
            .update("\n")
            .update(stableKey)
            .digest("hex")
            .slice(0, 40)}`
        : null;
      if (stableAssetId) {
        const existing = await repo.getAsset(
          ctx.userId,
          stableAssetId,
          accountId,
        );
        if (existing) return existing;
      }
      const storage = await objectStorageForCtx(ctx);
      // Mint a key exactly like the presigned path would (assetType-prefixed) so the
      // on-disk / bucket layout is identical to a client upload.
      const { storageKey } = await storage.createPresignedUpload({
        assetType: input.assetType,
        mimeType: input.mimeType,
        fileSize: input.bytes.byteLength,
        // [T-157] 服务端直写(采集封面/AI 生成)同样按当前号分区,与客户端上传布局一致。
        // [T-332 S2] 已在入口断言,直接用断言后的号。
        accountId,
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
      if (stableAssetId) {
        return repo.materializeGeneratedAsset(
          ctx.userId,
          {
            assetId: stableAssetId,
            assetType: input.assetType,
            name: input.name,
            status: input.pending ? "pending" : "active",
            storageKey,
            mimeType: head.mimeType || input.mimeType,
            fileSize: head.fileSize || input.bytes.byteLength,
            checksum: head.checksum,
            width: head.width,
            height: head.height,
            durationMs: head.durationMs,
            mediaMetadata: {
              ...head.mediaMetadata,
              adoptionRef: stableAssetId,
            },
          },
          accountId,
        );
      }
      // Materialize: asset (active) → first file (v1) → re-point currentFileId (mirror
      // completeUpload). The repo stamps userId + status='active'.
      const asset = await repo.insertAsset(
        ctx.userId,
        {
          assetType: input.assetType,
          name: input.name,
          currentFileId: null,
          // [T-219] 截图端口传 pending → 生为待确认态(素材库 list 按 active 过滤,不显示)。
          status: input.pending ? "pending" : "active",
        },
        accountId,
      );
      const file = await repo.insertAssetFile(
        ctx.userId,
        {
          assetId: asset.id,
          storageKey,
          mimeType: head.mimeType || input.mimeType,
          fileSize: head.fileSize || input.bytes.byteLength,
          checksum: head.checksum,
          width: head.width,
          height: head.height,
          durationMs: head.durationMs,
          mediaMetadata: head.mediaMetadata,
        },
        accountId,
      );
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        asset.id,
        {
          currentFileId: file.id,
        },
        accountId,
      );
      return updated ?? asset;
    },

    async addAssetFile(ctx, assetId, input) {
      const accountId = requireAccountId(ctx.accountId, "assets.addAssetFile");
      // Verify ownership (C2) before touching storage/repo.
      await requireAsset(ctx, assetId);
      const storage = await objectStorageForCtx(ctx);
      const head = await storage.headObject(input.storageKey);
      const file = await repo.insertAssetFile(
        ctx.userId,
        {
          assetId,
          storageKey: input.storageKey,
          mimeType: head.mimeType,
          fileSize: head.fileSize,
          checksum: head.checksum,
          width: head.width,
          height: head.height,
          durationMs: head.durationMs,
          mediaMetadata: head.mediaMetadata,
        },
        accountId,
      );
      // Advance currentFileId to the new file (the favorite/version affordance).
      await repo.updateAssetStatus(
        ctx.userId,
        assetId,
        {
          currentFileId: file.id,
        },
        accountId,
      );
      return file;
    },

    async trashAsset(ctx, assetId) {
      const accountId = requireAccountId(ctx.accountId, "assets.trashAsset");
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
        accountId,
      );
      return updated!;
    },

    async restoreAsset(ctx, assetId) {
      const accountId = requireAccountId(ctx.accountId, "assets.restoreAsset");
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
        accountId,
      );
      return updated!;
    },

    async toggleFavorite(ctx, assetId) {
      // 收藏翻转 (mirror trashAsset's load→update shape). 收藏 is orthogonal to the
      // §12 status machine, so there is NO transition guard — any owned asset can
      // be (un)favorited. Flips the current isFavorite and re-reads the row.
      const accountId = requireAccountId(ctx.accountId, "assets.toggleFavorite");
      const asset = await requireAsset(ctx, assetId);
      const updated = await repo.updateAssetStatus(
        ctx.userId,
        assetId,
        {
          isFavorite: !asset.isFavorite,
        },
        accountId,
      );
      return updated!;
    },

    async listAssetUsage(ctx, assetId) {
      requireAccountId(ctx.accountId, "assets.listAssetUsage");
      // 用料反查: assert ownership first (foreign/unknown/跨号 → 404, no leak), then
      // return the 用料链 edges that reference this asset.
      await requireAsset(ctx, assetId);
      return repo.listAssetUsage(ctx.userId, assetId);
    },

    async archiveAsset(ctx, assetId) {
      const accountId = requireAccountId(ctx.accountId, "assets.archiveAsset");
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
        accountId,
      );
      return updated!;
    },

    async unarchiveAsset(ctx, assetId) {
      const accountId = requireAccountId(ctx.accountId, "assets.unarchiveAsset");
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
        accountId,
      );
      return updated!;
    },
  };
}
