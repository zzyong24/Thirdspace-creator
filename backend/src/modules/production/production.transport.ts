import { ENDPOINTS, type Endpoint, type RequestContext, type Transport } from "@creatoros/contract";
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
  "outputs.production.editor.get",
  "outputs.production.editor.save",
  "outputs.production.editor.apply",
  "outputs.production.editor.restore",
  "outputs.production.editor.versions.list",
  "outputs.production.editor.versions.get",
  "outputs.production.editor.receipt.get",
  "outputs.production.editor.render",
  "outputs.production.editor.renders.list",
  "outputs.production.get",
  "outputs.production.put",
  "outputs.production.editingPlan.confirm",
  "outputs.production.editingPlan.broll.remove",
  "productions.segments.create",
  "productions.segments.list",
  "productions.exports.create",
  // [T-721] 素材包统一导出(本地 zip → 一次性对象存储产物 → 签名下载 URL)。
  "productions.exports.materials",
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
      // All owned ops are persisted. No ctx ⇒ unauthenticated dispatch ⇒
      // reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;

      const { params, body, query } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        outputId?: string;
        productionId?: string;
        exportId?: string;
        revision?:number;
        requestId?:string;
      };

      switch (endpoint.id) {
        case "outputs.production.editor.get":return {data:await service.getEditor(ctx,p.outputId??""),meta:{requestId}};
        case "outputs.production.editor.save":return {data:await service.saveEditor(ctx,p.outputId??"",ENDPOINTS.saveProductionEditor.body.parse(body)),meta:{requestId}};
        case "outputs.production.editor.apply":return {data:await service.applyEditor(ctx,p.outputId??"",ENDPOINTS.applyProductionEditor.body.parse(body)),meta:{requestId}};
        case "outputs.production.editor.restore":return {data:await service.restoreEditor(ctx,p.outputId??"",ENDPOINTS.restoreProductionEditor.body.parse(body)),meta:{requestId}};
        case "outputs.production.editor.versions.list":return {data:await service.listEditorVersions(ctx,p.outputId??"",ENDPOINTS.listProductionEditorVersions.query.parse(query??{})),meta:{requestId}};
        case "outputs.production.editor.versions.get":return {data:await service.getEditorVersion(ctx,p.outputId??"",ENDPOINTS.getProductionEditorVersion.params.parse(params).revision),meta:{requestId}};
        case "outputs.production.editor.receipt.get":return {data:await service.getEditorReceipt(ctx,p.outputId??"",ENDPOINTS.getProductionEditorReceipt.params.parse(params).requestId),meta:{requestId}};
        case "outputs.production.editor.render":return {data:await service.renderEditor(ctx,p.outputId??"",ENDPOINTS.renderProductionEditor.body.parse(body)),meta:{requestId}};
        case "outputs.production.editor.renders.list":return {data:await service.listEditorRenders(ctx,p.outputId??"",ENDPOINTS.listProductionEditorRenders.query.parse(query??{})),meta:{requestId}};
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
        case "outputs.production.editingPlan.confirm": {
          const b = (body ?? {}) as {
            expectedRevision: number;
            plan: Record<string, unknown>;
          };
          const row = await service.confirmEditingPlan(
            ctx,
            p.outputId ?? "",
            b,
          );
          return { data: toProductionResource(row), meta: { requestId } };
        }
        case "outputs.production.editingPlan.broll.remove": {
          const b = (body ?? {}) as {
            expectedRevision: number;
            assetId: string;
          };
          const row = await service.removeEditingPlanBroll(
            ctx,
            p.outputId ?? "",
            b,
          );
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
        case "productions.segments.list": {
          const rows = await service.listSegments(ctx, p.productionId ?? "");
          return { data: rows.map(toSegmentResource), meta: { requestId } };
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
        case "productions.exports.materials": {
          // [T-366b] 结果已是 wire 形状(service 组好 DTO,无 row 投影层)。
          const data = await service.exportMaterials(ctx, p.productionId ?? "");
          return { data, meta: { requestId } };
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
