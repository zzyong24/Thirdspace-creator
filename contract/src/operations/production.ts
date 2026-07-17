import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id } from "../primitives";
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
  // 本地打包成 zip 落 asset(P-04 不出网),返回签名下载 URL。诚实门:包是「原素材+
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
