import { z } from "zod";
import { id, iso8601, platformId, publicationStatus } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Publication extends BaseEntity, Timestamped.
export const publicationResource = z.object({
  id,
  contentOutputId: id,
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
  category: z.string(),
  series: z.string(),
  platformTags: z.array(z.string()),
  platformSettings: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type PublicationRevisionResource = z.infer<
  typeof publicationRevisionResource
>;
