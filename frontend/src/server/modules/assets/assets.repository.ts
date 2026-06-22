import { and, asc, eq, desc, type Db } from "@creatoros/backend";
import { assets, assetFiles, assetUploads } from "./assets.db-schema";
import { OwnershipError } from "./assets.errors";

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

export type AssetRow = typeof assets.$inferSelect;
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
  listAssets(userId: string, query: ListAssetsQuery): Promise<AssetRow[]>;
  getAsset(userId: string, assetId: string): Promise<AssetRow | null>;
  insertAsset(
    userId: string,
    input: { assetType: string; name: string; currentFileId: string | null },
  ): Promise<AssetRow>;
  updateAssetStatus(
    userId: string,
    assetId: string,
    patch: {
      status?: string;
      deletedAt?: string | null;
      currentFileId?: string;
    },
  ): Promise<AssetRow | null>;
  listAssetFiles(userId: string, assetId: string): Promise<AssetFileRow[]>;
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
  // Internal ownership gate reused by the file methods (cross-user / unknown id
  // is indistinguishable → 404, never reveal existence).
  async function requireOwnedAsset(
    userId: string,
    assetId: string,
  ): Promise<AssetRow> {
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId)));
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

    async listAssets(userId, query) {
      // Default gallery scope: active-only (trash/archived excluded). Ordered
      // newest-first; the cursor is the createdAt of the last seen row (simple
      // keyset pagination consistent with paginationQuery's intent).
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.userId, userId), eq(assets.status, "active")))
        .orderBy(desc(assets.createdAt), asc(assets.id));
      const sliced = query.cursor
        ? rows.filter((r) => r.createdAt < query.cursor!)
        : rows;
      return sliced.slice(0, query.limit);
    },

    async getAsset(userId, assetId) {
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.id, assetId), eq(assets.userId, userId)));
      return rows[0] ?? null;
    },

    async insertAsset(userId, input) {
      const now = deps.now();
      const id = deps.nextId("asset");
      await db.insert(assets).values({
        id,
        userId,
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

    async updateAssetStatus(userId, assetId, patch) {
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.deletedAt !== undefined) set.deletedAt = patch.deletedAt;
      if (patch.currentFileId !== undefined)
        set.currentFileId = patch.currentFileId;
      await db
        .update(assets)
        .set(set)
        .where(and(eq(assets.id, assetId), eq(assets.userId, userId)));
      // Re-read scoped: if the WHERE matched 0 rows (wrong user), the read also
      // returns null, so a cross-user update is a no-op surfacing as null.
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.id, assetId), eq(assets.userId, userId)));
      return rows[0] ?? null;
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
