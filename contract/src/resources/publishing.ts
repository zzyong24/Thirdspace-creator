import { z } from "zod";
import { id, iso8601, platformId, publicationStatus } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Publication extends BaseEntity, Timestamped.
export const publicationResource = z.object({
  id,
  contentOutputId: id,
  accountId:id.nullable().optional(),
  groupId:id.nullable().optional(),
  platform: platformId,
  accountReference: z.string(),
  status: publicationStatus,
  currentRevisionId: id,
  externalId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  scheduledAt: iso8601.nullable(),
  publishedAt: iso8601.nullable(),
  removedAt: iso8601.nullable(),
  // [T-073] 平台侧可见性:抖音端「仅自己可见/已隐藏」的作品仍是 published(未删除),
  // 但列表默认不展示。非空 = 采集(明细导出「审核状态」列)或手动标记的隐藏时刻;
  // null = 可见。default(null) 保证存量 payload / fixture(不带该键)仍能 parse。
  // 与 removedAt(平台已删)语义正交:hidden 可恢复可见,removed 不可。
  hiddenAt: iso8601.nullable().default(null),
  // [T-033] 平台侧审核状态原值(detail 导出 .xlsx「审核状态」列,如「已通过」/「仅自己可见」/「私密」/「审核中」/
  // 「未通过」)。列表默认按 exact '已通过' 过滤(配合 hiddenAt 双闸);NULL = 旧数据(没跑过 detail 同步)向后
  // 兼容视为可见。
  platformStatus: z.string().nullable().default(null),
  ...timestamps,
});
export type PublicationResource = z.infer<typeof publicationResource>;

// PublicationRevision extends BaseEntity only (no Timestamped).
export const publicationRevisionResource = z.object({
  id,
  publicationId: id,
  revisionNumber: z.number().int(),
  title: z.string(),
  description: z.string(),
  coverAssetId: id.nullable(),
  coverAssetFileId: id.nullable().optional(),
  category: z.string(),
  series: z.string(),
  platformTags: z.array(z.string()),
  platformSettings: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type PublicationRevisionResource = z.infer<
  typeof publicationRevisionResource
>;

export const publicationVisualNoteSchema=z.object({schemaVersion:z.literal(1),sourceCanvasId:id,sourceGroupId:id,sourceCanvasRevision:z.number().int().positive(),imageMode:z.enum(["single_cover","carousel"]),aspectRatio:z.string(),orderedAssetIds:z.array(id).min(1).max(20),pageReceipts:z.array(z.object({nodeId:id,taskId:id.optional(),resultId:id.optional(),fileId:id,checksum:z.string()}).strict()).min(1).max(20)}).strict();
export type PublicationVisualNote=z.infer<typeof publicationVisualNoteSchema>;
