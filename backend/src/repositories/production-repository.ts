import { eq, and, asc } from "drizzle-orm";
import type { Db } from "../db";
import {
  productions,
  productionSegments,
  exportRecords,
} from "../schema/production";

// Injected dependencies — mirrors project-repository / knowledge-repository's
// RepoDeps so the repo stays deterministic (no Date.now / Math.random / fetch
// inside) and user-scoped.
export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner threaded from RequestContext
}

// Production.status FSM (SPEC §12 / contract productionStatus). Transitions are
// adjacent-only along this order, mirroring project-repository's STAGE_ORDER.
const PRODUCTION_STATUS_ORDER = [
  "drafting",
  "recording",
  "editing",
  "rendering",
  "ready",
] as const;
type ProductionStatus = (typeof PRODUCTION_STATUS_ORDER)[number];

// ExportRecord.status FSM (contract exportRecordStatus). queued→rendering→ready
// is the happy path; `failed` is reachable from any non-terminal state.
const EXPORT_STATUS_ORDER = ["queued", "rendering", "ready"] as const;
type ExportStatus = "queued" | "rendering" | "ready" | "failed";

type ProductionRow = typeof productions.$inferSelect;
type SegmentRow = typeof productionSegments.$inferSelect;
type ExportRow = typeof exportRecords.$inferSelect;

export interface ProductionRepository {
  seedProductions(rows: ProductionRow[]): Promise<void>;
  list(): Promise<ProductionRow[]>;
  get(productionId: string): Promise<ProductionRow>;
  // CONTENT_OUTPUT ||--o| PRODUCTION is 0..1: (content_output_id) is UNIQUE, so
  // ensuring a production for an output is idempotent (onConflictDoNothing).
  ensureProductionForOutput(input: {
    contentOutputId: string;
    productionMode?: string;
  }): Promise<ProductionRow>;
  transitionStatus(
    productionId: string,
    status: ProductionStatus,
  ): Promise<ProductionRow>;
  // Segments
  listSegments(productionId: string): Promise<SegmentRow[]>;
  addSegment(
    productionId: string,
    input: {
      title: string;
      scriptSectionId?: string | null;
      startMs?: number;
      endMs?: number;
    },
  ): Promise<SegmentRow>;
  // Exports
  listExports(productionId: string): Promise<ExportRow[]>;
  createExport(
    productionId: string,
    input: {
      format: string;
      resolution: string;
      aspectRatio: string;
      bitrate?: number;
    },
  ): Promise<ExportRow>;
  transitionExportStatus(
    exportId: string,
    status: ExportStatus,
    input?: { resultAssetId?: string },
  ): Promise<ExportRow>;
}

export function createProductionRepository(
  db: Db,
  deps: RepoDeps,
): ProductionRepository {
  // Owner-scoped read: a row owned by another user is invisible → same
  // "not found" surface project/knowledge repositories use for cross-user /
  // missing rows (OwnershipError 404).
  async function get(productionId: string): Promise<ProductionRow> {
    const rows = await db
      .select()
      .from(productions)
      .where(
        and(
          eq(productions.id, productionId),
          eq(productions.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: production not found: ${productionId}`);
    }
    return row;
  }

  // Export rows are gated through their parent production's ownership.
  async function getExport(exportId: string): Promise<ExportRow> {
    const rows = await db
      .select()
      .from(exportRecords)
      .where(
        and(
          eq(exportRecords.id, exportId),
          eq(exportRecords.userId, deps.userId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new Error(`OwnershipError: export not found: ${exportId}`);
    }
    return row;
  }

  return {
    async seedProductions(rows) {
      if (rows.length === 0) return;
      await db.insert(productions).values(rows).onConflictDoNothing();
    },

    async list() {
      return db
        .select()
        .from(productions)
        .where(eq(productions.userId, deps.userId))
        .orderBy(asc(productions.updatedAt));
    },

    get,

    // Idempotent on (content_output_id) UNIQUE: a second call for the same
    // output is a no-op insert, and we return the existing row. This is the
    // CONTENT_OUTPUT ||--o| PRODUCTION 0..1 invariant.
    async ensureProductionForOutput({ contentOutputId, productionMode }) {
      const ts = deps.now();
      await db
        .insert(productions)
        .values({
          id: deps.nextId("production"),
          userId: deps.userId,
          contentOutputId,
          productionMode: productionMode ?? "remote_recording",
          status: "drafting",
          recordingConfig: {},
          subtitleConfig: {},
          startedAt: null,
          completedAt: null,
          updatedAt: ts,
        })
        .onConflictDoNothing();
      // Read back the canonical row (whether freshly inserted or pre-existing),
      // scoped to this owner.
      const rows = await db
        .select()
        .from(productions)
        .where(
          and(
            eq(productions.contentOutputId, contentOutputId),
            eq(productions.userId, deps.userId),
          ),
        );
      const row = rows[0];
      if (!row) {
        // The output is owned by another user (UNIQUE conflict swallowed our
        // insert, owner-scoped read finds nothing) → same not-found surface.
        throw new Error(
          `OwnershipError: production not found for output: ${contentOutputId}`,
        );
      }
      return row;
    },

    // Adjacent-only status FSM, mirroring project-repository.transition. `ready`
    // stamps completedAt; leaving `drafting` stamps startedAt.
    async transitionStatus(productionId, status) {
      const production = await get(productionId);
      const fromIdx = PRODUCTION_STATUS_ORDER.indexOf(
        production.status as ProductionStatus,
      );
      const toIdx = PRODUCTION_STATUS_ORDER.indexOf(status);
      if (toIdx === -1 || Math.abs(toIdx - fromIdx) !== 1) {
        throw new Error(
          `ConflictError: illegal production status transition ${production.status} -> ${status}`,
        );
      }
      const ts = deps.now();
      const set: Partial<ProductionRow> = { status, updatedAt: ts };
      if (production.status === "drafting" && production.startedAt === null) {
        set.startedAt = ts;
      }
      if (status === "ready") {
        set.completedAt = ts;
      }
      const updated = await db
        .update(productions)
        .set(set)
        .where(eq(productions.id, productionId))
        .returning();
      return updated[0]!;
    },

    async listSegments(productionId) {
      await get(productionId); // ownership + existence gate
      return db
        .select()
        .from(productionSegments)
        .where(eq(productionSegments.productionId, productionId))
        .orderBy(asc(productionSegments.position));
    },

    // Appends a segment at the next position (monotonic per production).
    async addSegment(productionId, input) {
      await get(productionId); // ownership + existence gate
      const existing = await db
        .select()
        .from(productionSegments)
        .where(eq(productionSegments.productionId, productionId));
      const nextPosition = existing.length;
      const inserted = await db
        .insert(productionSegments)
        .values({
          id: deps.nextId("segment"),
          userId: deps.userId,
          productionId,
          scriptSectionId: input.scriptSectionId ?? null,
          title: input.title,
          position: nextPosition,
          startMs: input.startMs ?? 0,
          endMs: input.endMs ?? 0,
          segmentConfig: {},
        })
        .returning();
      return inserted[0]!;
    },

    async listExports(productionId) {
      await get(productionId); // ownership + existence gate
      return db
        .select()
        .from(exportRecords)
        .where(eq(exportRecords.productionId, productionId))
        .orderBy(asc(exportRecords.createdAt));
    },

    async createExport(productionId, input) {
      await get(productionId); // ownership + existence gate
      const ts = deps.now();
      const inserted = await db
        .insert(exportRecords)
        .values({
          id: deps.nextId("export"),
          userId: deps.userId,
          productionId,
          resultAssetId: null,
          format: input.format,
          resolution: input.resolution,
          aspectRatio: input.aspectRatio,
          bitrate: input.bitrate ?? 0,
          status: "queued",
          exportConfig: {},
          createdAt: ts,
          completedAt: null,
        })
        .returning();
      return inserted[0]!;
    },

    // ExportRecord status FSM (queued→rendering→ready adjacent-only; `failed`
    // reachable from any non-terminal state). `ready` stamps resultAssetId +
    // completedAt.
    async transitionExportStatus(exportId, status, input) {
      const record = await getExport(exportId);
      const legal =
        status === "failed"
          ? record.status !== "ready" && record.status !== "failed"
          : (() => {
              const fromIdx = EXPORT_STATUS_ORDER.indexOf(
                record.status as (typeof EXPORT_STATUS_ORDER)[number],
              );
              const toIdx = EXPORT_STATUS_ORDER.indexOf(
                status as (typeof EXPORT_STATUS_ORDER)[number],
              );
              return fromIdx !== -1 && toIdx - fromIdx === 1;
            })();
      if (!legal) {
        throw new Error(
          `ConflictError: illegal export status transition ${record.status} -> ${status}`,
        );
      }
      const ts = deps.now();
      const set: Partial<ExportRow> = { status };
      if (status === "ready") {
        set.completedAt = ts;
        if (input?.resultAssetId !== undefined) {
          set.resultAssetId = input.resultAssetId;
        }
      }
      const updated = await db
        .update(exportRecords)
        .set(set)
        .where(eq(exportRecords.id, exportId))
        .returning();
      return updated[0]!;
    },

    // TODO(segment-assets): segmentAssets table is schema-only this wave (no
    // contract op wired against it; the asset-attach button is decorative). Add
    // attach/detach/list ops here once the contract resource gains operations.
  };
}
