import { and, asc, eq, type Db } from "@creatoros/backend";
import {
  productions,
  productionSegments,
  exportRecords,
} from "./production.db-schema";
import { OwnershipError } from "./production.errors";

// Production repository (foundation §5.2) — user-scoped queries ONLY. `user_id`
// lives on EVERY owned row; every read/write filters `eq(table.userId,
// deps.userId)` and every insert stamps `userId: deps.userId`. Child rows
// (segments / exports) are additionally gated through the parent production's
// ownership check, so they are never reachable cross-user (foundation §2, SPEC
// §14: cross-user → OwnershipError 404, never reveal existence).
//
// `userId` is baked into `deps` (one repo instance per ctx) — the service builds
// a fresh repo per request via `repoFor(ctx)`. The clock/id generator are injected
// for deterministic tests. The §12 status machines live in the SERVICE; the
// repository only executes service-approved updates.

export type ProductionRow = typeof productions.$inferSelect;
export type ProductionSegmentRow = typeof productionSegments.$inferSelect;
export type ExportRecordRow = typeof exportRecords.$inferSelect;

export interface RepoDeps {
  now: () => string; // ISO-8601 clock (injected for deterministic tests)
  nextId: (prefix: string) => string; // id generator (deterministic in tests)
  userId: string; // owner — baked in; the service mints one repo per ctx
}

export interface ProductionRepository {
  seedProductions(rows: ProductionRow[]): Promise<void>;
  getProductionByOutput(outputId: string): Promise<ProductionRow>;
  ensureProductionForOutput(outputId: string): Promise<ProductionRow>;
  getProductionById(productionId: string): Promise<ProductionRow>;
  updateProduction(
    productionId: string,
    patch: {
      productionMode?: string;
      status?: string;
      recordingConfig?: Record<string, unknown>;
      subtitleConfig?: Record<string, unknown>;
      startedAt?: string | null;
      completedAt?: string | null;
    },
  ): Promise<ProductionRow>;
  createSegment(
    productionId: string,
    input: {
      title: string;
      position: number;
      startMs: number;
      endMs: number;
      // SEAM-04:溯源到的脚本段 id(可选);无则 null(诚实空,不编造)。
      scriptSectionId?: string | null;
    },
  ): Promise<ProductionSegmentRow>;
  listSegments(productionId: string): Promise<ProductionSegmentRow[]>;
  createExport(
    productionId: string,
    input: {
      format: string;
      resolution: string;
      aspectRatio: string;
      bitrate?: number;
    },
  ): Promise<ExportRecordRow>;
  getExport(exportId: string): Promise<ExportRecordRow>;
  completeExportRow(
    exportId: string,
    input: { resultAssetId: string; status: string },
  ): Promise<ExportRecordRow>;
}

export function createProductionRepository(
  db: Db,
  deps: RepoDeps,
): ProductionRepository {
  const userId = deps.userId;

  // Private ownership gate — a cross-user / unknown id is indistinguishable from
  // a missing one (foundation §2: 404, never reveal existence) → OwnershipError.
  async function getProductionRowById(
    productionId: string,
  ): Promise<ProductionRow> {
    const rows = await db
      .select()
      .from(productions)
      .where(
        and(eq(productions.id, productionId), eq(productions.userId, userId)),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: production not found: ${productionId}`);
    }
    return row;
  }

  async function getProductionByOutput(
    outputId: string,
  ): Promise<ProductionRow> {
    const rows = await db
      .select()
      .from(productions)
      .where(
        and(
          eq(productions.userId, userId),
          eq(productions.contentOutputId, outputId),
        ),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: production not found: ${outputId}`);
    }
    return row;
  }

  return {
    async seedProductions(rows) {
      if (rows.length === 0) return;
      await db.insert(productions).values(rows).onConflictDoNothing();
    },

    getProductionByOutput,

    getProductionById: getProductionRowById,

    async ensureProductionForOutput(outputId) {
      // Get-or-create scoped by output. The UNIQUE index on content_output_id
      // makes the row at-most-one per output (data-model 0..1), so a second call
      // returns the SAME id (idempotent — backs the initial GET load).
      const existing = await db
        .select()
        .from(productions)
        .where(
          and(
            eq(productions.userId, userId),
            eq(productions.contentOutputId, outputId),
          ),
        );
      if (existing[0]) return existing[0];

      const now = deps.now();
      const id = deps.nextId("production");
      // [T-049 B10] SELECT-then-INSERT 有并发竞态:页面首载时 wiring 与 VM 两路并发
      // 各自 ensure,后插者撞 content_output_id 唯一索引直接炸 → wiring=undefined →
      // 录制工作台随机消失(刷新才出现,真机复现过)。onConflictDoNothing 让后到者
      // 安静落败,随后按 outputId 重查赢家行返回 —— 两路拿到同一行。
      await db
        .insert(productions)
        .values({
          id,
          userId,
          contentOutputId: outputId,
          productionMode: "remote_recording",
          status: "drafting",
          recordingConfig: {},
          subtitleConfig: {},
          startedAt: null,
          completedAt: null,
          updatedAt: now,
        })
        .onConflictDoNothing();
      const winner = await getProductionByOutput(outputId);
      return winner;
    },

    async updateProduction(productionId, patch) {
      // Ownership gate first (cross-user / unknown id → OwnershipError 404).
      await getProductionRowById(productionId);
      const set: Record<string, unknown> = { updatedAt: deps.now() };
      if (patch.productionMode !== undefined)
        set.productionMode = patch.productionMode;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.recordingConfig !== undefined)
        set.recordingConfig = patch.recordingConfig;
      if (patch.subtitleConfig !== undefined)
        set.subtitleConfig = patch.subtitleConfig;
      if (patch.startedAt !== undefined) set.startedAt = patch.startedAt;
      if (patch.completedAt !== undefined) set.completedAt = patch.completedAt;
      await db
        .update(productions)
        .set(set)
        .where(
          and(eq(productions.id, productionId), eq(productions.userId, userId)),
        );
      return getProductionRowById(productionId);
    },

    async createSegment(productionId, input) {
      // Parent-ownership gate before the write (no cross-user child rows).
      await getProductionRowById(productionId);
      const id = deps.nextId("segment");
      await db.insert(productionSegments).values({
        id,
        userId,
        productionId,
        // SEAM-04:真填脚本段溯源(去掉写死 null);调用方按位置对应给 id,无对应则仍 null。
        scriptSectionId: input.scriptSectionId ?? null,
        title: input.title,
        position: input.position,
        startMs: input.startMs,
        endMs: input.endMs,
        segmentConfig: {},
      });
      const rows = await db
        .select()
        .from(productionSegments)
        .where(
          and(
            eq(productionSegments.id, id),
            eq(productionSegments.userId, userId),
          ),
        );
      return rows[0]!;
    },

    async listSegments(productionId) {
      await getProductionRowById(productionId);
      return db
        .select()
        .from(productionSegments)
        .where(
          and(
            eq(productionSegments.userId, userId),
            eq(productionSegments.productionId, productionId),
          ),
        )
        .orderBy(asc(productionSegments.position));
    },

    async createExport(productionId, input) {
      // Parent-ownership gate before the write.
      await getProductionRowById(productionId);
      const id = deps.nextId("export");
      await db.insert(exportRecords).values({
        id,
        userId,
        productionId,
        resultAssetId: null,
        format: input.format,
        resolution: input.resolution,
        aspectRatio: input.aspectRatio,
        bitrate: input.bitrate ?? 0,
        status: "queued",
        exportConfig: {},
        createdAt: deps.now(),
        completedAt: null,
      });
      return getExportRow(id);
    },

    getExport: getExportRow,

    async completeExportRow(exportId, input) {
      await getExportRow(exportId); // ownership gate
      await db
        .update(exportRecords)
        .set({
          resultAssetId: input.resultAssetId,
          status: input.status,
          completedAt: deps.now(),
        })
        .where(
          and(
            eq(exportRecords.id, exportId),
            eq(exportRecords.userId, userId),
          ),
        );
      return getExportRow(exportId);
    },
  };

  async function getExportRow(exportId: string): Promise<ExportRecordRow> {
    const rows = await db
      .select()
      .from(exportRecords)
      .where(
        and(eq(exportRecords.id, exportId), eq(exportRecords.userId, userId)),
      );
    const row = rows[0];
    if (!row) {
      throw new OwnershipError(`OwnershipError: export not found: ${exportId}`);
    }
    return row;
  }
}
