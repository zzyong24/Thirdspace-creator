import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createProductionRepository,
  type ProductionRepository,
  type ProductionRow,
  type ProductionSegmentRow,
  type ExportRecordRow,
} from "./production.repository";
import { ConflictError } from "./production.errors";

// Production service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into a user-scoped repository built per-call via `repoFor(ctx)`
// (foundation §2). It owns the SPEC §12 state machines:
//   - Production.status: drafting → recording → editing → rendering → ready
//     (forward-only, ADJACENT steps; any skip/backward → ConflictError).
//   - ExportRecord.status: queued|rendering → ready (exports.complete drives it).
//
// The completeExport method is the SPEC §11 cross-module fan-out. There is no
// formal UnitOfWork class in shared infra yet (the realized artifacts module does
// the same: durable main write, then BEST-EFFORT post-commit peer calls that never
// roll back the export fact). Peer access is ONLY through injected public service
// seams — NO cross-module repository import (SPEC §22). Each seam is optional so
// the service is unit-testable with stubs and the module builds without the peers.

// Production.status ordering (contract enum is authoritative — plan §31).
const STATUS_ORDER = [
  "drafting",
  "recording",
  "editing",
  "rendering",
  "ready",
] as const;

// Injected cross-module fan-out seams (public service interfaces only). Each is
// optional; a missing seam is simply skipped (best-effort, SPEC §11).
export type SetPrimaryOutputAsset = (
  ctx: RequestContext,
  input: { outputId: string; assetId: string },
) => Promise<unknown>;
export type SearchIndexAsset = (
  ctx: RequestContext,
  input: { entityType: string; entityId: string; title: string; body: string },
) => Promise<unknown>;
export type RecordExportActivity = (
  ctx: RequestContext,
  input: {
    outputId: string;
    exportId: string;
    resultAssetId: string;
  },
) => Promise<unknown>;

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  /** ContentOutput active→ready primary-asset link (ProjectsService.patchOutput). */
  setPrimaryOutputAsset?: SetPrimaryOutputAsset;
  /** Post-commit search index upsert (SearchService.upsertDocument). */
  searchIndexAsset?: SearchIndexAsset;
  /** Post-commit activity record (ProjectsService.recordActivity / equivalent). */
  recordExportActivity?: RecordExportActivity;
}

export interface ProductionService {
  getProduction(ctx: RequestContext, outputId: string): Promise<ProductionRow>;
  updateProduction(
    ctx: RequestContext,
    outputId: string,
    patch: {
      productionMode?: string;
      status?: string;
      recordingConfig?: Record<string, unknown>;
      subtitleConfig?: Record<string, unknown>;
    },
  ): Promise<ProductionRow>;
  createSegment(
    ctx: RequestContext,
    productionId: string,
    body: {
      title: string;
      position: number;
      startMs: number;
      endMs: number;
      // SEAM-04:溯源脚本段 id(可选);透传给仓库,无则落 null。
      scriptSectionId?: string | null;
    },
  ): Promise<ProductionSegmentRow>;
  listSegments(
    ctx: RequestContext,
    productionId: string,
  ): Promise<ProductionSegmentRow[]>;
  requestExport(
    ctx: RequestContext,
    productionId: string,
    body: { format: string; resolution: string; aspectRatio: string },
  ): Promise<ExportRecordRow>;
  completeExport(
    ctx: RequestContext,
    exportId: string,
    body: { resultAssetId: string },
  ): Promise<ExportRecordRow>;
}

// bitrate has no contract input field but is a non-null DTO field. Derive it from
// the resolution at request time (plan open-question #3 — fixed lookup), so the
// queued record already carries a sensible value.
function bitrateForResolution(resolution: string): number {
  switch (resolution) {
    case "2160p":
      return 35_000_000;
    case "1440p":
      return 16_000_000;
    case "1080p":
      return 8_000_000;
    case "720p":
      return 5_000_000;
    case "480p":
      return 2_500_000;
    default:
      return 8_000_000;
  }
}

export function createProductionService(deps: ServiceDeps): ProductionService {
  function repoFor(ctx: RequestContext): ProductionRepository {
    return createProductionRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
    });
  }

  return {
    async getProduction(ctx, outputId) {
      // Backs outputs.production.get — get-or-create so the initial page load
      // resolves a real row even before the creator enters production.
      return repoFor(ctx).ensureProductionForOutput(outputId);
    },

    async updateProduction(ctx, outputId, patch) {
      const repo = repoFor(ctx);
      const production = await repo.getProductionByOutput(outputId);

      const extra: { startedAt?: string | null } = {};
      if (patch.status !== undefined) {
        const fromIdx = STATUS_ORDER.indexOf(
          production.status as (typeof STATUS_ORDER)[number],
        );
        const toIdx = STATUS_ORDER.indexOf(
          patch.status as (typeof STATUS_ORDER)[number],
        );
        // Forward-only, adjacent step. Unknown enum (-1) or any non-+1 delta is
        // illegal (skip or backward) → ConflictError (§12).
        if (fromIdx < 0 || toIdx < 0 || toIdx - fromIdx !== 1) {
          throw new ConflictError(
            `Illegal production status transition: ${production.status} -> ${patch.status}`,
          );
        }
        // Entering `recording` from `drafting` stamps startedAt if unset.
        if (patch.status === "recording" && production.startedAt === null) {
          extra.startedAt = deps.now();
        }
      }

      return repo.updateProduction(production.id, { ...patch, ...extra });
    },

    async createSegment(ctx, productionId, body) {
      return repoFor(ctx).createSegment(productionId, body);
    },

    async listSegments(ctx, productionId) {
      return repoFor(ctx).listSegments(productionId);
    },

    async requestExport(ctx, productionId, body) {
      // Mock render is async/out-of-band; the export sits `queued` until
      // completeExport drives it to `ready` (plan Step 3).
      return repoFor(ctx).createExport(productionId, {
        ...body,
        bitrate: bitrateForResolution(body.resolution),
      });
    },

    async completeExport(ctx, exportId, body) {
      const repo = repoFor(ctx);
      const current = await repo.getExport(exportId); // ownership gate

      // Idempotency (SPEC §22): a re-delivered complete returns the already-ready
      // row WITHOUT re-running the fan-out (no double primary-asset link / index).
      if (current.status === "ready") {
        return current;
      }
      // Only an in-flight export may complete (§12: queued|rendering → ready).
      if (current.status !== "queued" && current.status !== "rendering") {
        throw new ConflictError(
          `Export cannot complete from status: ${current.status}`,
        );
      }

      // 1. Durable main write — the export fact (status ready + resultAssetId).
      const completed = await repo.completeExportRow(exportId, {
        resultAssetId: body.resultAssetId,
        status: "ready",
      });

      // 2. Cross-module fan-out via PUBLIC service seams (no repo import). The
      //    object file itself was staged through MockObjectStorage upstream
      //    (SPEC §15: Production never touches S3). Resolve the owning output to
      //    drive the ContentOutput active→ready primary-asset link.
      const production = await repo.getProductionById(completed.productionId);

      // 3. Post-commit side-effects run AFTER the main write succeeds; a failure
      //    records a retryable state, never rolls back the export fact (SPEC §11).
      if (deps.setPrimaryOutputAsset) {
        try {
          await deps.setPrimaryOutputAsset(ctx, {
            outputId: production.contentOutputId,
            assetId: body.resultAssetId,
          });
        } catch {
          // swallow — derived link is retryable, never fatal to the export fact.
        }
      }
      if (deps.searchIndexAsset) {
        try {
          await deps.searchIndexAsset(ctx, {
            entityType: "asset",
            entityId: body.resultAssetId,
            title: `导出视频 ${completed.format}`,
            body: `${completed.resolution} ${completed.aspectRatio}`,
          });
        } catch {
          // swallow — derived index is retryable.
        }
      }
      if (deps.recordExportActivity) {
        try {
          await deps.recordExportActivity(ctx, {
            outputId: production.contentOutputId,
            exportId: completed.id,
            resultAssetId: body.resultAssetId,
          });
        } catch {
          // swallow — the activity log is derived, retryable.
        }
      }

      return completed;
    },
  };
}
