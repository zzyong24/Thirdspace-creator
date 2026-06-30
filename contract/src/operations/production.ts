import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id } from "../primitives";
import {
  productionResource,
  productionSegmentResource,
  exportRecordResource,
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
