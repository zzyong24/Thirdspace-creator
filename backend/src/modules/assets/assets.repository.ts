import { and, asc, eq, desc, inArray, type Db } from "@creatoros/backend";
import { materialLinks } from "@creatoros/backend";
import { assets, assetFiles, assetUploads } from "./assets.db-schema";
import { OwnershipError } from "./assets.errors";

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
  // [T-136 切片 b] owned-root(assets)方法加**可选** accountId(additive:旧调用不传
  // = undefined → 门退化不过滤 = 返该 user 全部,行为不变)。有号时按号过滤(读)/ stamp
  // (写)。repo 是单例、userId 随调用传,故 accountId 也随调用传(不能 baked 进 deps)。
  listAssets(
    userId: string,
    query: ListAssetsQuery,
    accountId?: string | null,
  ): Promise<AssetRow[]>;
  getAsset(
    userId: string,
    assetId: string,
    accountId?: string | null,
  ): Promise<AssetRow | null>;
  insertAsset(
    userId: string,
    input: { assetType: string; name: string; currentFileId: string | null },
    accountId?: string | null,
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
    accountId?: string | null,
  ): Promise<AssetRow | null>;
  // 用料反查 (mirror material-links list, inverse direction): the user-scoped 用料链
  // edges whose entity_type='asset' AND entity_id=assetId — i.e. which 创作 use
  // this asset. Newest-first. No ownership gate on the asset itself here; the
  // SERVICE asserts asset ownership first (requireAsset) before calling this.
  listAssetUsage(userId: string, assetId: string): Promise<MaterialLinkRow[]>;
  listAssetFiles(userId: string, assetId: string): Promise<AssetFileRow[]>;
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
  ): Promise<void>;
  // [T-146 切片 a] 落文档抽取结果到 current file:extractedText(全文,可空)+ extractStatus
  // (done/failed/unsupported)。文件不存在 → no-op(诚实静默,抽取是增强)。要点卡 materialSummary
  // 走 mergeFileMetadata(jsonb),与此分开(全文/状态是独立列,要点卡是 metadata)。
  updateFileExtraction(
    userId: string,
    assetId: string,
    patch: { extractedText?: string | null; extractStatus?: string },
  ): Promise<void>;
  insertAssetFile(
    userId: string,
    input: InsertAssetFileInput,
  ): Promise<AssetFileRow>;
  createUploadSession(
    userId: string,
    input: {
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
  ): Promise<AssetUploadRow | null>;
  markUploadCompleted(userId: string, uploadId: string): Promise<void>;
}

function parseFile(row: AssetFileDbRow): AssetFileRow {
  return { ...row, fileSize: Number(row.fileSize) };
}

export function createAssetRepository(
  db: Db,
  deps: RepoDeps,
): AssetRepository {
  // [T-136 切片 b] 按号隔离条件门:有号叠加 `eq(assets.accountId, …)`,无号(undefined/null,
  // 全局视图/存量)返 undefined → drizzle `and()` 忽略 → 退化为只按 userId 过滤。
  function accountGate(accountId?: string | null) {
    return accountId ? eq(assets.accountId, accountId) : undefined;
  }

  // Internal ownership gate reused by the file methods (cross-user / unknown id
  // is indistinguishable → 404, never reveal existence). accountId 可选:owned-root
  // 直接读点(getAsset 等)传号叠加过滤;子表方法(insertAssetFile/listAssetFiles)经
  // 此门透传属主但**不叠加账号门**(assetId 已唯一定位,账号维度在父读点隔离,SPEC §9)。
  async function requireOwnedAsset(
    userId: string,
    assetId: string,
    accountId?: string | null,
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
      const rows = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.userId, userId),
            eq(assets.status, "active"),
            accountGate(accountId),
          ),
        )
        .orderBy(desc(assets.createdAt), asc(assets.id));
      const sliced = query.cursor
        ? rows.filter((r) => r.createdAt < query.cursor!)
        : rows;
      return sliced.slice(0, query.limit);
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

    async insertAsset(userId, input, accountId) {
      const now = deps.now();
      const id = deps.nextId("asset");
      await db.insert(assets).values({
        id,
        userId,
        // [T-136 切片 b] create stamp:归到当前号(null 兜底,列 nullable)。
        accountId: accountId ?? null,
        currentFileId: input.currentFileId,
        assetType: input.assetType,
        name: input.name,
        description: "",
        status: "active",
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

    async listAssetFiles(userId, assetId) {
      await requireOwnedAsset(userId, assetId); // ownership gate
      const rows = await db
        .select()
        .from(assetFiles)
        .where(eq(assetFiles.assetId, assetId))
        .orderBy(asc(assetFiles.versionNumber));
      return rows.map(parseFile);
    },

    async mergeFileMetadata(userId, assetId, patch) {
      const files = await this.listAssetFiles(userId, assetId);
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

    async updateFileExtraction(userId, assetId, patch) {
      // [T-146 切片 a] 写 current file 的抽取列。文件不存在 → 静默(与 mergeFileMetadata 一致)。
      const files = await this.listAssetFiles(userId, assetId);
      const current = files[files.length - 1];
      if (!current) return;
      const set: Record<string, unknown> = {};
      if (patch.extractedText !== undefined) set.extractedText = patch.extractedText;
      if (patch.extractStatus !== undefined) set.extractStatus = patch.extractStatus;
      if (Object.keys(set).length === 0) return;
      await db.update(assetFiles).set(set).where(eq(assetFiles.id, current.id));
    },

    async insertAssetFile(userId, input) {
      // Caller must own the asset (cross-user → OwnershipError, no leak).
      await requireOwnedAsset(userId, input.assetId);
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

    async getUploadSession(userId, uploadId) {
      const rows = await db
        .select()
        .from(assetUploads)
        .where(
          and(eq(assetUploads.id, uploadId), eq(assetUploads.userId, userId)),
        );
      return rows[0] ?? null;
    },

    async markUploadCompleted(userId, uploadId) {
      await db
        .update(assetUploads)
        .set({ status: "completed" })
        .where(
          and(eq(assetUploads.id, uploadId), eq(assetUploads.userId, userId)),
        );
    },
  };
}
