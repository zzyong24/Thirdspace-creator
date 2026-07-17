import { z } from "zod";
import { id, iso8601 } from "../primitives";

// All entities here extend BaseEntity only (no Timestamped). Any createdAt /
// updatedAt / completedAt fields below are declared explicitly per domain.ts.

// Enums not exported by primitives.ts — defined locally from domain.ts.
const productionMode = z.enum([
  "remote_recording",
  "screen_capture",
  "studio",
]);
const productionStatus = z.enum([
  "drafting",
  "recording",
  "editing",
  "rendering",
  "ready",
]);
const segmentAssetUsageType = z.enum([
  "video",
  "broll",
  "overlay",
  "audio",
  "caption",
]);
const exportRecordStatus = z.enum(["queued", "rendering", "ready", "failed"]);

export const productionResource = z.object({
  id,
  contentOutputId: id,
  productionMode,
  status: productionStatus,
  recordingConfig: z.record(z.string(), z.unknown()),
  subtitleConfig: z.record(z.string(), z.unknown()),
  startedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
  updatedAt: iso8601,
});
export type ProductionResource = z.infer<typeof productionResource>;

export const productionSegmentResource = z.object({
  id,
  productionId: id,
  scriptSectionId: id.nullable(),
  title: z.string(),
  position: z.number().int(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  segmentConfig: z.record(z.string(), z.unknown()),
});
export type ProductionSegmentResource = z.infer<
  typeof productionSegmentResource
>;

export const segmentAssetResource = z.object({
  id,
  productionSegmentId: id,
  assetId: id,
  usageType: segmentAssetUsageType,
  position: z.number().int(),
});
export type SegmentAssetResource = z.infer<typeof segmentAssetResource>;

export const exportRecordResource = z.object({
  id,
  productionId: id,
  resultAssetId: id,
  format: z.string(),
  resolution: z.string(),
  aspectRatio: z.string(),
  bitrate: z.number().int(),
  status: exportRecordStatus,
  exportConfig: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
  completedAt: iso8601.nullable(),
});
export type ExportRecordResource = z.infer<typeof exportRecordResource>;

// [T-366b] 素材包统一导出的返回:zip 已本地打包落成一个 asset(P-04 不出网),
// 前端拿 downloadUrl 直接触发下载。fileCount/totalBytes 供 UI 诚实呈现包内容量;
// hasDecisions=false 表示项目未跑四决策(readme 内已按 §5.1② 写明空态,不冒充)。
export const materialExportResource = z.object({
  assetId: id,
  downloadUrl: z.string().min(1),
  fileName: z.string().min(1),
  fileCount: z.number().int(),
  totalBytes: z.number().int(),
  hasDecisions: z.boolean(),
});
export type MaterialExportResource = z.infer<typeof materialExportResource>;
