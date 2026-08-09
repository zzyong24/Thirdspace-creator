import { and, asc, eq, desc, inArray, type Db } from "@creatoros/backend";
import { materialLinks } from "@creatoros/backend";
import { assets, assetFiles, assetUploads } from "./assets.db-schema";
import { OwnershipError } from "./assets.errors";
import type { HeadObjectResult } from "./object-storage";

// Inverse-usage read row (用料反查): the 用料链 edges that reference an asset.
// We import the materialLinks TABLE (not the material-links module/repo — no
// cross-module repo import) for a user-scoped read of the BillOfMaterials edges
// pointing AT this asset. Shape == contract materialLinkResource.
export type MaterialLinkRow = typeof materialLinks.$inferSelect;

// Assets repository (foundation §5.2) — user-scoped queries ONLY. Every
// read/write on `assets`/`asset_uploads` filters on `userId`; `asset_files`
// queries scope by an ownership gate on the parent asset (foundation §1/§2,
// SPEC §10/§20). There is NO unscoped select/update.
//
// `userId` comes from RequestContext, passed per-call (NOT baked into deps): one
// repo instance serves all users; the service threads `ctx.userId`. The clock/id
// generator are injected (`deps`) for deterministic tests.
//
// §12 invariants are enforced by the SERVICE (the repo never transitions on its
// own): the repo only stamps `status='active'` at insert and exposes
// updateAssetStatus for the service to drive trash/restore/archive.

// isFavorite is a notNull(.default(false)) column added for 收藏 persistence.
// We mark it OPTIONAL on the exported AssetRow so external seeders (the shared
// persistence-client `toAssetRow` mapper, outside this module's lane) that build
// an AssetRow literal without 收藏 still type-check — the DB column defaults to
// false on insert, and every reader (transport/service) coalesces `?? false`.
export type AssetRow = Omit<typeof assets.$inferSelect, "isFavorite"> & {
  isFavorite?: boolean;
};
type AssetFileDbRow = typeof assetFiles.$inferSelect;
export type AssetUploadRow = typeof assetUploads.$inferSelect;

// fileSize is bigint; pglite returns it as a JS number, but Number() it
// defensively so the DTO stays numeric (assetFileResource.fileSize is int).
export type AssetFileRow = Omit<AssetFileDbRow, "fileSize"> & {
  fileSize: number;
};

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
}

export interface ListAssetsQuery {
  limit: number;
  cursor: string | null;
  /** page/pageSize transport 的稳定偏移；既有 cursor 调用缺省为 0。 */
  offset?: number;
  // [T-248 批B] 可选状态过滤:缺省 "active"(既有调用不变);"deleted" = 回收站
  // 视图读回已回收素材(还原入口的读侧配套)。
  status?: "active" | "deleted";
}

export interface InsertAssetFileInput {
  assetId: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  mediaMetadata: Record<string, unknown>;
}

export interface AssetRepository {
  seedAssets(rows: AssetRow[]): Promise<void>;
  seedAssetFiles(rows: AssetFileRow[]): Promise<void>;
  // [T-332 S2] claimOrphanAssets 已退役(SPEC §4.4):清库世界没有孤儿,采集/AI 生成
  //   的 asset 出生即带号(ctx 账号由绑定/job 派生),不存在「先落 NULL 再认领」的窗口。
  // [T-219] 确认门:把 user 名下某 pending asset 翻成 active(幂等:已 active / 不存在 /
  //   越权 → 返 null,不误翻 archived/deleted)。[T-332 S2] accountId 收紧为必填 string 且
  //   叠进 WHERE:pending 出生即带号(ISO-03),跨号确认 → 不命中 → null(§4.6 确认门
  //   二次校验:换号后不能把 A 号的 pending 确认进 B 号)。
  commitPendingAsset(
    userId: string,
    assetId: string,
    accountId: string,
  ): Promise<AssetRow | null>;
  // [T-332 S2] owned-root(assets)方法的 accountId 收紧为**必填 string**(strict 门,
  // SPEC §4.1):service 层断言 requireAccountId 后传入,repo 不再有 undefined 退化全量
  // 的分支。repo 是单例、userId 随调用传,故 accountId 也随调用传(不能 baked 进 deps)。
  listAssets(
    userId: string,
    query: ListAssetsQuery,
    accountId: string,
  ): Promise<AssetRow[]>;
  getAsset(
    userId: string,
    assetId: string,
    accountId: string,
  ): Promise<AssetRow | null>;
  /**
   * [T-251] 按来源 URL 反查最近一条 document 类 asset(web.read 落库时把 sourceUrl 存进
   * current file 的 mediaMetadata)。**pending/active 都算**(pending = 已抓到全文但用户还没点
   * 「存入素材库」——重读同 URL 不重新抓取的语义对它同样成立)。查不到 → null。user-scoped +
   * strict 按号门(与 getAsset 同门)。
   */
  findAssetBySourceUrl(
    userId: string,
    sourceUrl: string,
    accountId: string,
  ): Promise<AssetRow | null>;
  insertAsset(
    userId: string,
    input: {
      assetType: string;
      name: string;
      currentFileId: string | null;
      // [T-219] 出生态(缺省 active,兼容所有既有调用)。截图端口传 'pending' → 待确认门翻转
      //   才进素材库(list 按 active 过滤,pending 天然不显示)。
      status?: string;
    },
    accountId: string,
  ): Promise<AssetRow>;
  updateAssetStatus(
    userId: string,
    assetId: string,
    patch: {
      status?: string;
      deletedAt?: string | null;
      currentFileId?: string;
      isFavorite?: boolean;
    },
    accountId: string,
  ): Promise<AssetRow | null>;
  // 用料反查 (mirror material-links list, inverse direction): the user-scoped 用料链
  // edges whose entity_type='asset' AND entity_id=assetId — i.e. which 创作 use
  // this asset. Newest-first. No ownership gate on the asset itself here; the
  // SERVICE asserts asset ownership first (requireAsset) before calling this.
  listAssetUsage(userId: string, assetId: string): Promise<MaterialLinkRow[]>;
  // [T-332 S2] 子表(asset_files)方法带必填 accountId:父锚(assets)by-id 门叠号
  // (§4.5 号一致性门),跨号 asset 的文件不可达。
  listAssetFiles(
    userId: string,
    assetId: string,
    accountId: string,
  ): Promise<AssetFileRow[]>;
  /**
   * [T-061] Batch-read asset_files by id — the list/get 投影 join(current file
   * 元数据进 assetResource)。IDs must come from already user-scoped asset rows
   * (currentFileId), so no extra ownership filter here.
   */
  listFilesByIds(fileIds: string[]): Promise<AssetFileRow[]>;
  // [T-055h asset.classify] 把 AI 归类结果(一句话描述等)合并进某 asset 当前文件的
  // mediaMetadata(jsonb merge,不动其他键)。文件不存在 → no-op(诚实静默,分类是增强)。
  mergeFileMetadata(
    userId: string,
    assetId: string,
    patch: Record<string, unknown>,
    accountId: string,
  ): Promise<void>;
  // [T-146 切片 a] 落文档抽取结果到 current file:extractedText(全文,可空)+ extractStatus
  // (done/failed/unsupported)。文件不存在 → no-op(诚实静默,抽取是增强)。要点卡 materialSummary
  // 走 mergeFileMetadata(jsonb),与此分开(全文/状态是独立列,要点卡是 metadata)。
  updateFileExtraction(
    userId: string,
    assetId: string,
    patch: { extractedText?: string | null; extractStatus?: string },
    accountId: string,
  ): Promise<void>;
  /**
   * [T-298] 条件回填旧 local-fs 视频占位元信息。repository 再做一次父资产
   * user+account 归属校验、currentFile 校验和精确旧签名 CAS，避免后台探针在
   * 列表返回后发生竞态时覆盖新文件或人工修正过的数据。
   */
  backfillLegacyMediaMetadata(
    userId: string,
    assetId: string,
    fileId: string,
    patch: {
      durationMs: number;
      width: number;
      height: number;
      backfilledAt: string;
    },
    accountId: string,
  ): Promise<boolean>;
  insertAssetFile(
    userId: string,
    input: InsertAssetFileInput,
    accountId: string,
  ): Promise<AssetFileRow>;
  createUploadSession(
    userId: string,
    input: {
      accountId: string;
      assetId: string;
      assetType: string;
      mimeType: string;
      fileSize: number;
      storageKey: string;
      expiresAt: string;
    },
  ): Promise<AssetUploadRow>;
  getUploadSession(
    userId: string,
    uploadId: string,
    accountId: string,
  ): Promise<AssetUploadRow | null>;
  /**
   * 把上传凭证、首个文件版本与稳定 assetId 在同一事务内物化。重复调用返回同一
   * asset；任一步失败都会回滚，不留下半成品。
   */
  completeUploadSession(
    userId: string,
    uploadId: string,
    accountId: string,
    input: { name: string; head: HeadObjectResult },
  ): Promise<AssetRow | null>;
}

function parseFile(row: AssetFileDbRow): AssetFileRow {
  return { ...row, fileSize: Number(row.fileSize) };
}

export function createAssetRepository(
  db: Db,
  deps: RepoDeps,
): AssetRepository {
  // [T-332 S2] 按号隔离 strict 门:一律 `eq(assets.accountId, accountId)`,参数必填
  // string(service 层 requireAccountId 断言后传入)—— 不再有 undefined 退化全量的
  // lenient 分支(拍板 ② 废除存量兜底)。asset 出生即带号(ISO-03),读侧永不放宽。
  function accountGate(accountId: string) {
    return eq(assets.accountId, accountId);
  }

  // Internal ownership gate reused by the file methods (cross-user / unknown id
  // is indistinguishable → 404, never reveal existence). [T-332 S2] accountId 必填:
  // by-id 读叠「号一致性门」(SPEC §4.5)—— 跨号 asset 与不存在同貌(404),子表方法
  // (insertAssetFile/listAssetFiles)经此门透传属主 + 账号维度。
  async function requireOwnedAsset(
    userId: string,
    assetId: string,
    accountId: string,
  ): Promise<AssetRow> {
    const rows = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.userId, userId),
          accountGate(accountId),
        ),
      );
    const row = rows[0];
    if (!row) throw new OwnershipError("Asset not found");
    return row;
  }

  return {
    async commitPendingAsset(userId, assetId, accountId) {
      // 只翻 pending → active(WHERE status='pending' 保证幂等 + 不误动其他态)。
      // [T-332 S2] WHERE 叠账号门:pending 出生即带号(ISO-03),确认时二次校验与当前
      // ctx 一致(SPEC §4.6)—— 换号后确认别号的 pending → 不命中 → null(service 404)。
      await db
        .update(assets)
        .set({ status: "active", updatedAt: deps.now() })
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.userId, userId),
            accountGate(accountId),
            eq(assets.status, "pending"),
          ),
        );
      // 回读 user+account-scoped:WHERE 未命中(非 pending / 越权 / 跨号 / 不存在)→
      // 读也返 null → service 抛 404。
      const rows = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.userId, userId),
            accountGate(accountId),
          ),
        );
      const row = rows[0];
      // 命中且已 active 才算翻转成功;若该 id 是本 user 本号的但当时非 pending(已
      // active/deleted),回读会拿到它但状态不是我们刚翻的 —— 用 status==='active'
      // 兜底判定(commit 幂等语义)。
      return row && row.status === "active" ? row : null;
    },

    async seedAssets(rows) {
      if (rows.length === 0) return;
      await db.insert(assets).values(rows).onConflictDoNothing();
    },
    async seedAssetFiles(rows) {
      if (rows.length === 0) return;
      await db.insert(assetFiles).values(rows).onConflictDoNothing();
    },

    async listAssets(userId, query, accountId) {
      // Default gallery scope: active-only (trash/archived excluded). Ordered
      // newest-first; the cursor is the createdAt of the last seen row (simple
      // keyset pagination consistent with paginationQuery's intent).
      // [T-248 批B] query.status 可选覆盖:"deleted" = 回收站视图(读回已回收素材,
      // 供还原);缺省仍 active-only,既有调用行为不变。
      const rows = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.userId, userId),
            eq(assets.status, query.status ?? "active"),
            accountGate(accountId),
          ),
        )
        .orderBy(desc(assets.createdAt), asc(assets.id));
      const sliced = query.cursor
        ? rows.filter((r) => r.createdAt < query.cursor!)
        : rows;
      const offset = Math.max(0, query.offset ?? 0);
      return sliced.slice(offset, offset + query.limit);
    },

    async getAsset(userId, assetId, accountId) {
      const rows = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.userId, userId),
            accountGate(accountId),
          ),
        );
      return rows[0] ?? null;
    },

    async findAssetBySourceUrl(userId, sourceUrl, accountId) {
      // [T-251] 两步查(jsonb 键匹配放 JS 侧,PGlite/PG 双栈无 SQL 方言分歧):
      //   ① 该 user 的 document 类 asset(pending/active),新→旧;
      //   ② 批量拉它们的文件行,按 mediaMetadata.sourceUrl 精确匹配,取最新命中。
      const candidates = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.userId, userId),
            eq(assets.assetType, "document"),
            inArray(assets.status, ["pending", "active"]),
            accountGate(accountId),
          ),
        )
        .orderBy(desc(assets.createdAt), asc(assets.id));
      if (candidates.length === 0) return null;
      const files = await db
        .select()
        .from(assetFiles)
        .where(
          inArray(
            assetFiles.assetId,
            candidates.map((a) => a.id),
          ),
        );
      const matchedAssetIds = new Set(
        files
          .filter(
            (f) =>
              ((f.mediaMetadata as Record<string, unknown> | null) ?? {})[
                "sourceUrl"
              ] === sourceUrl,
          )
          .map((f) => f.assetId),
      );
      return candidates.find((a) => matchedAssetIds.has(a.id)) ?? null;
    },

    async insertAsset(userId, input, accountId) {
      const now = deps.now();
      const id = deps.nextId("asset");
      await db.insert(assets).values({
        id,
        userId,
        // [T-332 S2] create stamp:归到当前号(必填 string,service 断言后传入;ISO-03
        //   出生即带号,不再有 null 兜底)。
        accountId,
        currentFileId: input.currentFileId,
        assetType: input.assetType,
        name: input.name,
        description: "",
        // [T-219] 出生态可选(缺省 active,兼容既有);截图端口传 'pending' 待确认门翻转。
        status: input.status ?? "active",
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const rows = await db.select().from(assets).where(eq(assets.id, id));
      return rows[0]!;
    },

    async updateAssetStatus(userId, assetId, patch, accountId) {
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.deletedAt !== undefined) set.deletedAt = patch.deletedAt;
      if (patch.currentFileId !== undefined)
        set.currentFileId = patch.currentFileId;
      if (patch.isFavorite !== undefined) set.isFavorite = patch.isFavorite;
      await db
        .update(assets)
        .set(set)
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.userId, userId),
            accountGate(accountId),
          ),
        );
      // Re-read scoped: if the WHERE matched 0 rows (wrong user/account), the read
      // also returns null, so a cross-user/cross-account update is a no-op → null.
      const rows = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.userId, userId),
            accountGate(accountId),
          ),
        );
      return rows[0] ?? null;
    },

    async listAssetUsage(userId, assetId) {
      // 用料反查: user-scoped 用料链 edges that reference THIS asset (entity_type
      // 'asset'). Newest-first. The service has already asserted asset ownership;
      // the userId filter here additionally scopes the edges to the same owner.
      const rows = await db
        .select()
        .from(materialLinks)
        .where(
          and(
            eq(materialLinks.userId, userId),
            eq(materialLinks.entityType, "asset"),
            eq(materialLinks.entityId, assetId),
          ),
        )
        .orderBy(desc(materialLinks.createdAt));
      return rows;
    },

    async listFilesByIds(fileIds) {
      if (fileIds.length === 0) return [];
      return db.select().from(assetFiles).where(inArray(assetFiles.id, fileIds));
    },

    async listAssetFiles(userId, assetId, accountId) {
      await requireOwnedAsset(userId, assetId, accountId); // ownership + 账号门
      const rows = await db
        .select()
        .from(assetFiles)
        .where(eq(assetFiles.assetId, assetId))
        .orderBy(asc(assetFiles.versionNumber));
      return rows.map(parseFile);
    },

    async mergeFileMetadata(userId, assetId, patch, accountId) {
      const files = await this.listAssetFiles(userId, assetId, accountId);
      const current = files[files.length - 1];
      if (!current) return;
      await db
        .update(assetFiles)
        .set({
          mediaMetadata: {
            ...((current.mediaMetadata as Record<string, unknown>) ?? {}),
            ...patch,
          },
        })
        .where(eq(assetFiles.id, current.id));
    },

    async updateFileExtraction(userId, assetId, patch, accountId) {
      // [T-146 切片 a] 写 current file 的抽取列。文件不存在 → 静默(与 mergeFileMetadata 一致)。
      const files = await this.listAssetFiles(userId, assetId, accountId);
      const current = files[files.length - 1];
      if (!current) return;
      const set: Record<string, unknown> = {};
      if (patch.extractedText !== undefined) set.extractedText = patch.extractedText;
      if (patch.extractStatus !== undefined) set.extractStatus = patch.extractStatus;
      if (Object.keys(set).length === 0) return;
      await db.update(assetFiles).set(set).where(eq(assetFiles.id, current.id));
    },

    async backfillLegacyMediaMetadata(
      userId,
      assetId,
      fileId,
      patch,
      accountId,
    ) {
      const asset = await requireOwnedAsset(userId, assetId, accountId);
      // 只允许改当前版本；离页/上传新版本后后台旧探针不能回写过期 file。
      if (asset.currentFileId !== fileId) return false;
      const [current] = await db
        .select()
        .from(assetFiles)
        .where(and(eq(assetFiles.id, fileId), eq(assetFiles.assetId, assetId)));
      if (!current) return false;
      const metadata =
        (current.mediaMetadata as Record<string, unknown> | null) ?? {};
      // 精确旧签名 + 持久标记双门：非旧数据不碰；真实恰好也是 1s/1920 的视频
      // 回填后靠 marker 保持幂等，不会每次打开素材库都重复 ffprobe。
      if (
        current.durationMs !== 1000 ||
        current.width !== 1920 ||
        metadata["legacyMediaProbeBackfilledAt"] !== undefined
      ) {
        return false;
      }
      const updated = await db
        .update(assetFiles)
        .set({
          durationMs: patch.durationMs,
          width: patch.width,
          height: patch.height,
          mediaMetadata: {
            ...metadata,
            legacyMediaProbeBackfilledAt: patch.backfilledAt,
            legacyMediaProbeSource: "local-fs-headObject",
          },
        })
        .where(
          and(
            eq(assetFiles.id, fileId),
            eq(assetFiles.assetId, assetId),
            eq(assetFiles.durationMs, 1000),
            eq(assetFiles.width, 1920),
          ),
        )
        .returning({ id: assetFiles.id });
      return updated.length === 1;
    },

    async insertAssetFile(userId, input, accountId) {
      // Caller must own the asset (cross-user/跨号 → OwnershipError, no leak)。
      await requireOwnedAsset(userId, input.assetId, accountId);
      const existing = await db
        .select()
        .from(assetFiles)
        .where(eq(assetFiles.assetId, input.assetId))
        .orderBy(desc(assetFiles.versionNumber));
      const nextNumber = (existing[0]?.versionNumber ?? 0) + 1;
      const id = deps.nextId("afile");
      await db.insert(assetFiles).values({
        id,
        assetId: input.assetId,
        versionNumber: nextNumber,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        checksum: input.checksum,
        width: input.width,
        height: input.height,
        durationMs: input.durationMs,
        mediaMetadata: input.mediaMetadata,
        createdAt: deps.now(),
      });
      const rows = await db
        .select()
        .from(assetFiles)
        .where(eq(assetFiles.id, id));
      return parseFile(rows[0]!);
    },

    async createUploadSession(userId, input) {
      const id = deps.nextId("upload");
      await db.insert(assetUploads).values({
        id,
        userId,
        accountId: input.accountId,
        assetId: input.assetId,
        assetType: input.assetType,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        storageKey: input.storageKey,
        status: "created",
        expiresAt: input.expiresAt,
        createdAt: deps.now(),
      });
      const rows = await db
        .select()
        .from(assetUploads)
        .where(eq(assetUploads.id, id));
      return rows[0]!;
    },

    async getUploadSession(userId, uploadId, accountId) {
      const rows = await db
        .select()
        .from(assetUploads)
        .where(
          and(
            eq(assetUploads.id, uploadId),
            eq(assetUploads.userId, userId),
            eq(assetUploads.accountId, accountId),
          ),
        );
      return rows[0] ?? null;
    },

    async completeUploadSession(userId, uploadId, accountId, input) {
      return db.transaction(async (tx) => {
        const sessionRows = await tx
          .select()
          .from(assetUploads)
          .where(
            and(
              eq(assetUploads.id, uploadId),
              eq(assetUploads.userId, userId),
              eq(assetUploads.accountId, accountId),
            ),
          );
        const session = sessionRows[0];
        if (!session) return null;

        if (session.status === "completed") {
          const existing = await tx
            .select()
            .from(assets)
            .where(
              and(
                eq(assets.id, session.assetId),
                eq(assets.userId, userId),
                eq(assets.accountId, accountId),
              ),
            );
          return existing[0] ?? null;
        }
        if (session.status !== "created") return null;

        // Content-addressed dedupe: use the authoritative checksum reported by
        // object storage, never the client filename.  Scope is deliberately
        // user + account + asset type so one account can never learn about or
        // reuse another account's private bytes.  Repointing the upload session
        // makes retries return the same stable asset as well.
        const duplicateRows = input.head.checksum
          ? await tx
              .select({ assetId: assets.id })
              .from(assets)
              .innerJoin(
                assetFiles,
                and(
                  eq(assetFiles.id, assets.currentFileId),
                  eq(assetFiles.checksum, input.head.checksum),
                ),
              )
              .where(
                and(
                  eq(assets.userId, userId),
                  eq(assets.accountId, accountId),
                  eq(assets.assetType, session.assetType),
                  eq(assets.status, "active"),
                ),
              )
              .orderBy(desc(assets.createdAt), asc(assets.id))
              .limit(1)
          : [];
        const duplicateAssetId = duplicateRows[0]?.assetId;
        if (duplicateAssetId) {
          const duplicateAssets = await tx
            .select()
            .from(assets)
            .where(
              and(
                eq(assets.id, duplicateAssetId),
                eq(assets.userId, userId),
                eq(assets.accountId, accountId),
              ),
            );
          const duplicate = duplicateAssets[0];
          if (!duplicate) return null;
          await tx
            .update(assetUploads)
            .set({
              assetId: duplicate.id,
              status: "completed",
              completedAssetFileId: duplicate.currentFileId,
            })
            .where(
              and(
                eq(assetUploads.id, uploadId),
                eq(assetUploads.userId, userId),
                eq(assetUploads.accountId, accountId),
                eq(assetUploads.status, "created"),
              ),
            );
          return duplicate;
        }

        const fileId = deps.nextId("afile");
        const now = deps.now();
        await tx.insert(assets).values({
          id: session.assetId,
          userId,
          accountId,
          currentFileId: fileId,
          assetType: session.assetType,
          name: input.name,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(assetFiles).values({
          id: fileId,
          assetId: session.assetId,
          versionNumber: 1,
          storageKey: session.storageKey,
          mimeType: input.head.mimeType || session.mimeType,
          fileSize: input.head.fileSize || session.fileSize,
          checksum: input.head.checksum,
          width: input.head.width,
          height: input.head.height,
          durationMs: input.head.durationMs,
          mediaMetadata: input.head.mediaMetadata,
          createdAt: now,
        });
        await tx
          .update(assetUploads)
          .set({ status: "completed", completedAssetFileId: fileId })
          .where(
            and(
              eq(assetUploads.id, uploadId),
              eq(assetUploads.userId, userId),
              eq(assetUploads.accountId, accountId),
              eq(assetUploads.status, "created"),
            ),
          );
        const rows = await tx
          .select()
          .from(assets)
          .where(eq(assets.id, session.assetId));
        return rows[0] ?? null;
      });
    },
  };
}
