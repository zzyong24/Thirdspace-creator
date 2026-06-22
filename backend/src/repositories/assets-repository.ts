import { eq, and, asc, desc } from "drizzle-orm";
import type { Db } from "../db";
import { assets, assetFiles, assetUploads } from "../schema/assets";

// Injected dependencies — mirrors project-repository / knowledge-repository's
// RepoDeps so the repo stays deterministic (no Date.now / Math.random / fetch
// inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

type AssetType = "image" | "video" | "audio" | "document" | "subtitle";
type AssetStatus = "active" | "archived" | "deleted";

type AssetRow = typeof assets.$inferSelect;
type FileRow = typeof assetFiles.$inferSelect;
type UploadRow = typeof assetUploads.$inferSelect;

// fileSize is bigint in the data-model; the contract DTO is z.number().int().
// pglite returns bigint as a JS number for in-range values, but Number()-parse
// it defensively on read so the DTO stays numeric (mirrors knowledge-repository's
// decimal-string handling).
type FileDto = Omit<FileRow, "fileSize"> & { fileSize: number };

const toFileDto = (row: FileRow): FileDto => ({
  ...row,
  fileSize: Number(row.fileSize),
});

// Upload-session DTO returned by createUpload (phase 1). Projects the stored
// `created` row to the `assetUpload` contract shape.
export interface AssetUploadDto {
  uploadId: string;
  storageKey: string;
  uploadUrl: string;
  expiresAt: string;
}

// Asset lifecycle FSM. Assets are born `active`. Allowed transitions are
// adjacent only — mirrors project-repository's stage guard. trash/restore and
// archive flow through this single guard:
//   active  ↔ archived
//   active  → deleted   (trash)
//   deleted → active    (restore)
const ALLOWED_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  active: ["archived", "deleted"],
  archived: ["active"],
  deleted: ["active"],
};

// Optional media metadata fields the completeUpload caller may supply; they land
// on the asset_files version row (schema: width/height/durationMs/checksum/
// mediaMetadata are all present on asset_files).
export interface MediaMetadataInput {
  checksum?: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  mediaMetadata?: Record<string, unknown>;
}

export interface AssetsRepository {
  seedAssets(rows: AssetRow[]): Promise<void>;
  list(): Promise<AssetRow[]>;
  get(assetId: string): Promise<AssetRow>;
  // Phase 1 of the two-phase upload: records a pending upload session.
  createUpload(input: {
    assetType: AssetType;
    mimeType: string;
    fileSize: number;
  }): Promise<AssetUploadDto>;
  // Phase 2: finalizes the upload → mints the asset + its first version file
  // (with media metadata) and marks the upload completed.
  completeUpload(
    uploadId: string,
    input: { name: string; description?: string } & MediaMetadataInput,
  ): Promise<AssetRow>;
  // Appends a new immutable version file and repoints currentFileId.
  addFile(
    assetId: string,
    input: { storageKey: string; mimeType?: string; fileSize?: number } & MediaMetadataInput,
  ): Promise<FileDto>;
  listFiles(assetId: string): Promise<FileDto[]>;
  archive(assetId: string): Promise<AssetRow>; // active → archived
  unarchive(assetId: string): Promise<AssetRow>; // archived → active
  trash(assetId: string): Promise<AssetRow>; // active → deleted
  restore(assetId: string): Promise<AssetRow>; // deleted → active
}

export function createAssetsRepository(db: Db, deps: RepoDeps): AssetsRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface the reference repos use for cross-user / missing rows.
  async function get(assetId: string): Promise<AssetRow> {
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, deps.userId)));
    const row = rows[0];
    if (!row) throw new Error(`OwnershipError: asset not found: ${assetId}`);
    return row;
  }

  // Single guarded transition — adjacent-only, mirrors project-repository's
  // stage guard. Sets deletedAt when moving into/out of `deleted`.
  async function transition(assetId: string, to: AssetStatus): Promise<AssetRow> {
    const asset = await get(assetId);
    const from = asset.status as AssetStatus;
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new Error(
        `ConflictError: illegal asset transition ${from} -> ${to}`,
      );
    }
    const ts = deps.now();
    const updated = await db
      .update(assets)
      .set({
        status: to,
        deletedAt: to === "deleted" ? ts : null,
        updatedAt: ts,
      })
      .where(eq(assets.id, assetId))
      .returning();
    return updated[0]!;
  }

  // Ownership + existence gate for an upload session.
  async function getUpload(uploadId: string): Promise<UploadRow> {
    const rows = await db
      .select()
      .from(assetUploads)
      .where(
        and(eq(assetUploads.id, uploadId), eq(assetUploads.userId, deps.userId)),
      );
    const row = rows[0];
    if (!row) throw new Error(`OwnershipError: upload not found: ${uploadId}`);
    return row;
  }

  return {
    async seedAssets(rows) {
      if (rows.length === 0) return;
      await db.insert(assets).values(rows).onConflictDoNothing();
    },

    async list() {
      return db
        .select()
        .from(assets)
        .where(eq(assets.userId, deps.userId))
        .orderBy(asc(assets.createdAt));
    },

    get,

    async createUpload({ assetType, mimeType, fileSize }) {
      const ts = deps.now();
      const uploadId = deps.nextId("upload");
      const storageKey = `uploads/${deps.userId}/${uploadId}`;
      // 24h presign window from the injected clock (deterministic).
      const expiresAt = new Date(
        new Date(ts).getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();

      await db.insert(assetUploads).values({
        id: uploadId,
        userId: deps.userId,
        assetType,
        mimeType,
        fileSize,
        storageKey,
        status: "created",
        expiresAt,
        createdAt: ts,
      });

      return {
        uploadId,
        storageKey,
        uploadUrl: `https://upload.local/${storageKey}`,
        expiresAt,
      };
    },

    async completeUpload(uploadId, input) {
      const upload = await getUpload(uploadId); // ownership + existence gate
      if (upload.status !== "created") {
        throw new Error(
          `ConflictError: upload already ${upload.status}: ${uploadId}`,
        );
      }
      const ts = deps.now();
      const assetId = deps.nextId("asset");
      const fileId = deps.nextId("file");

      // First version file (#1) records the media metadata from the finalized
      // upload. asset_files rows are immutable version rows.
      await db.insert(assetFiles).values({
        id: fileId,
        assetId,
        versionNumber: 1,
        storageKey: upload.storageKey,
        mimeType: upload.mimeType,
        fileSize: upload.fileSize,
        checksum: input.checksum ?? "",
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        mediaMetadata: input.mediaMetadata ?? {},
        createdAt: ts,
      });

      const inserted = await db
        .insert(assets)
        .values({
          id: assetId,
          userId: deps.userId,
          currentFileId: fileId,
          assetType: upload.assetType,
          name: input.name,
          description: input.description ?? "",
          status: "active",
          deletedAt: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();

      // Mark the session completed (one-shot — the status guard above prevents
      // double-finalize).
      await db
        .update(assetUploads)
        .set({ status: "completed" })
        .where(eq(assetUploads.id, uploadId));

      return inserted[0]!;
    },

    async addFile(assetId, input) {
      await get(assetId); // ownership + existence gate
      const ts = deps.now();

      const latest = await db
        .select()
        .from(assetFiles)
        .where(eq(assetFiles.assetId, assetId))
        .orderBy(desc(assetFiles.versionNumber))
        .limit(1);
      const nextNumber = (latest[0]?.versionNumber ?? 0) + 1;

      const fileId = deps.nextId("file");
      const inserted = await db
        .insert(assetFiles)
        .values({
          id: fileId,
          assetId,
          versionNumber: nextNumber,
          storageKey: input.storageKey,
          mimeType: input.mimeType ?? "application/octet-stream",
          fileSize: input.fileSize ?? 0,
          checksum: input.checksum ?? "",
          width: input.width ?? null,
          height: input.height ?? null,
          durationMs: input.durationMs ?? null,
          mediaMetadata: input.mediaMetadata ?? {},
          createdAt: ts,
        })
        .returning();

      // Repoint the asset at the freshly appended version; old rows untouched.
      await db
        .update(assets)
        .set({ currentFileId: fileId, updatedAt: ts })
        .where(eq(assets.id, assetId));

      return toFileDto(inserted[0]!);
    },

    async listFiles(assetId) {
      await get(assetId); // ownership + existence gate
      const rows = await db
        .select()
        .from(assetFiles)
        .where(eq(assetFiles.assetId, assetId))
        .orderBy(asc(assetFiles.versionNumber));
      return rows.map(toFileDto);
    },

    archive(assetId) {
      return transition(assetId, "archived");
    },
    unarchive(assetId) {
      return transition(assetId, "active");
    },
    trash(assetId) {
      return transition(assetId, "deleted");
    },
    restore(assetId) {
      return transition(assetId, "active");
    },
  };
}
