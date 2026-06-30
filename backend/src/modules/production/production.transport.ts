import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import { AuthenticationError, UnsupportedOperationError } from "./production.errors";
import type { ProductionService } from "./production.service";
import type {
  ProductionRow,
  ProductionSegmentRow,
  ExportRecordRow,
} from "./production.repository";
import type {
  ProductionResource,
  ProductionSegmentResource,
  ExportRecordResource,
} from "./production.schema";

// Production transport (foundation §5.4) — the module's 5 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// artifacts/assets transports: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// envelope. A persisted op reached with NO ctx is an unauthenticated dispatch →
// AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from PRODUCTION_OP_IDS (adding the module = registering it).

export const PRODUCTION_OP_IDS = [
  "outputs.production.get",
  "outputs.production.put",
  "productions.segments.create",
  "productions.exports.create",
  "exports.complete",
] as const;

function toProductionResource(row: ProductionRow): ProductionResource {
  return {
    id: row.id,
    contentOutputId: row.contentOutputId,
    productionMode: row.productionMode as ProductionResource["productionMode"],
    status: row.status as ProductionResource["status"],
    recordingConfig: (row.recordingConfig ?? {}) as Record<string, unknown>,
    subtitleConfig: (row.subtitleConfig ?? {}) as Record<string, unknown>,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    updatedAt: row.updatedAt,
  };
}

function toSegmentResource(
  row: ProductionSegmentRow,
): ProductionSegmentResource {
  return {
    id: row.id,
    productionId: row.productionId,
    scriptSectionId: row.scriptSectionId ?? null,
    title: row.title,
    position: row.position,
    startMs: row.startMs,
    endMs: row.endMs,
    segmentConfig: (row.segmentConfig ?? {}) as Record<string, unknown>,
  };
}

function toExportResource(row: ExportRecordRow): ExportRecordResource {
  return {
    id: row.id,
    productionId: row.productionId,
    // resultAssetId is nullable in the DB only while queued/rendering; the
    // contract resource requires it (id, a non-EMPTY string). A queued export has
    // no asset yet → coerce the pre-complete null to the "pending" sentinel so the
    // wire shape stays valid (the FE keys off `status === "ready"` to know the
    // asset is real). Mirrors artifacts coercing the pre-link currentVersionId.
    resultAssetId: row.resultAssetId ?? "pending",
    format: row.format,
    resolution: row.resolution,
    aspectRatio: row.aspectRatio,
    bitrate: row.bitrate,
    status: row.status as ExportRecordResource["status"],
    exportConfig: (row.exportConfig ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? null,
  };
}

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createProductionTransport(
  serviceFactory: () => ProductionService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // All 5 ops are persisted (owned). No ctx ⇒ unauthenticated dispatch ⇒
      // reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;

      const { params, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        outputId?: string;
        productionId?: string;
        exportId?: string;
      };

      switch (endpoint.id) {
        case "outputs.production.get": {
          const row = await service.getProduction(ctx, p.outputId ?? "");
          return { data: toProductionResource(row), meta: { requestId } };
        }
        case "outputs.production.put": {
          const b = (body ?? {}) as {
            productionMode?: string;
            status?: string;
            recordingConfig?: Record<string, unknown>;
            subtitleConfig?: Record<string, unknown>;
          };
          const row = await service.updateProduction(ctx, p.outputId ?? "", b);
          return { data: toProductionResource(row), meta: { requestId } };
        }
        case "productions.segments.create": {
          const b = (body ?? {}) as {
            title: string;
            position: number;
            startMs: number;
            endMs: number;
            // SEAM-04:溯源脚本段 id(可选)。
            scriptSectionId?: string | null;
          };
          const row = await service.createSegment(ctx, p.productionId ?? "", b);
          return { data: toSegmentResource(row), meta: { requestId } };
        }
        case "productions.exports.create": {
          const b = (body ?? {}) as {
            format: string;
            resolution: string;
            aspectRatio: string;
          };
          const row = await service.requestExport(ctx, p.productionId ?? "", b);
          return { data: toExportResource(row), meta: { requestId } };
        }
        case "exports.complete": {
          const b = (body ?? {}) as { resultAssetId: string };
          const row = await service.completeExport(ctx, p.exportId ?? "", b);
          return { data: toExportResource(row), meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
