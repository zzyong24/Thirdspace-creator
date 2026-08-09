import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, iso8601 } from "../primitives";
import {
  productionResource,
  productionSegmentResource,
  exportRecordResource,
  materialExportResource,
} from "../resources/production";

const outputParams = z.object({ outputId: id });
const productionParams = z.object({ productionId: id });
const exportParams = z.object({ exportId: id });

// SPEC §13 "制作 / Production" group.
export const productionOperations = {
  getOutputProduction: defineEndpoint({
    id: "outputs.production.get",
    method: "GET",
    path: "/outputs/:outputId/production",
    params: outputParams,
    response: productionResource,
    fr: ["FR-PRODUCTION-GET"],
  }),
  putOutputProduction: defineEndpoint({
    id: "outputs.production.put",
    method: "PUT",
    path: "/outputs/:outputId/production",
    params: outputParams,
    body: z.object({
      productionMode: z
        .enum(["remote_recording", "screen_capture", "studio"])
        .optional(),
      status: z
        .enum(["drafting", "recording", "editing", "rendering", "ready"])
        .optional(),
      recordingConfig: z.record(z.string(), z.unknown()).optional(),
      subtitleConfig: z.record(z.string(), z.unknown()).optional(),
    }),
    response: productionResource,
    fr: ["FR-PRODUCTION-UPDATE"],
  }),
  confirmProductionEditingPlan: defineEndpoint({
    id: "outputs.production.editingPlan.confirm",
    method: "PUT",
    path: "/outputs/:outputId/production/editing-plan",
    params: outputParams,
    body: z.object({
      expectedRevision: z.number().int().nonnegative(),
      plan: z.object({
        sourceTaskId: id.nullable(),
        sourceRenderTaskId: id.nullable().optional(),
        // 复用项目统一 ISO 时间契约。禁止调用 Zod 4 的 deprecated `.datetime()`：
        // Next 16 Turbopack 会在 client chunk 内触发 classic/schemas ↔ iso 的 TDZ 循环，
        // 导致整个桌面页面在 hydration 时白屏。
        confirmedAt: iso8601,
        decisions: z.record(z.string(), z.unknown()),
        renderProps: z.record(z.string(), z.unknown()),
      }),
    }),
    response: productionResource,
    fr: ["FR-703-EDITING-PLAN-CONFIRM"],
  }),
  createProductionSegment: defineEndpoint({
    id: "productions.segments.create",
    method: "POST",
    path: "/productions/:productionId/segments",
    params: productionParams,
    body: z.object({
      title: z.string().min(1),
      position: z.number().int(),
      startMs: z.number().int(),
      endMs: z.number().int(),
      // SEAM-04:拍摄章节溯源到脚本段。调用方按位置对应(第 N 章 ↔ 脚本第 N 段)填脚本段 id;
      // 无对应来源时省略 → 落 null(诚实空,不编造溯源)。
      scriptSectionId: id.optional(),
    }),
    response: productionSegmentResource,
    fr: ["FR-PRODUCTION-SEGMENT-CREATE"],
  }),
  // [T-051 2e] 章节列表读 op —— create 写了但此前无读回,时间线永远空(写真读假)。
  listSegments: defineEndpoint({
    id: "productions.segments.list",
    method: "GET",
    path: "/productions/:productionId/segments",
    params: productionParams,
    response: productionSegmentResource,
    isList: true,
    fr: ["FR-PRODUCTION-SEGMENTS-LIST"],
  }),
  createProductionExport: defineEndpoint({
    id: "productions.exports.create",
    method: "POST",
    path: "/productions/:productionId/exports",
    params: productionParams,
    body: z.object({
      format: z.string().min(1),
      resolution: z.string().min(1),
      aspectRatio: z.string().min(1),
    }),
    response: exportRecordResource,
    fr: ["FR-PRODUCTION-EXPORT-CREATE"],
  }),
  // [T-366b] 素材包统一导出:项目关联全部素材 + 口播稿 + 编导说明 readme + manifest
  // 本地打包成 zip 后只落对象存储的一次性下载产物，不创建 asset，返回签名下载 URL。诚实门:包是「原素材+
  // 编导说明」,不是可一键导入的剪映工程(VP-05,文案在前端与 readme 头)。
  exportProductionMaterials: defineEndpoint({
    id: "productions.exports.materials",
    method: "POST",
    path: "/productions/:productionId/exports/materials",
    params: productionParams,
    response: materialExportResource,
    fr: ["FR-PRODUCTION-EXPORT-MATERIALS"],
  }),
  completeExport: defineEndpoint({
    id: "exports.complete",
    method: "POST",
    path: "/exports/:exportId/complete",
    params: exportParams,
    body: z.object({ resultAssetId: id }),
    response: exportRecordResource,
    fr: ["FR-PRODUCTION-EXPORT-COMPLETE"],
  }),
} as const;
