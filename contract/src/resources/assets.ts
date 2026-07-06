import { z } from "zod";
import { id, iso8601, assetType } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Asset.status is a local literal union in domain.ts (not exported by primitives).
const assetStatus = z.enum(["active", "archived", "deleted"]);

// Asset extends BaseEntity + Timestamped.
export const assetResource = z.object({
  id,
  userId: id,
  currentFileId: id,
  assetType,
  name: z.string(),
  description: z.string(),
  status: assetStatus,
  // 收藏 (favorite) flag — toggled by assets.favorite.toggle. Persisted on the
  // asset row so the gallery 收藏 affordance survives reloads (not a client hack).
  isFavorite: z.boolean(),
  // [T-061] 当前文件派生字段(current asset_file 投影)。此前 list 不带文件元数据,
  // 前端只能从 fixture 兜底 → 真上传素材显示 octet-stream/0B 且渲不出真缩略图。
  // 无文件的 headless row → null(诚实,不编)。
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  // [T-146 切片 a] 文档抽取投影(current file 派生,additive nullable — 旧消费不破)。
  //   extractStatus: pending|done|failed|unsupported|null(非文档/未抽 → null)。
  //   materialSummary: 「资料要点卡」({ keyPoints[], facts[], sellingPoints?[] }),
  //     落在 file.mediaMetadata.materialSummary;未生成 → null。
  //   extractedText: 确定性抽取的全文(详情面板「查看全文」);未抽/非文档 → null。
  extractStatus: z.string().nullable(),
  materialSummary: z.record(z.string(), z.unknown()).nullable(),
  extractedText: z.string().nullable(),
  deletedAt: iso8601.nullable(),
  ...timestamps,
});
export type AssetResource = z.infer<typeof assetResource>;

// AssetFile extends BaseEntity only (carries its own createdAt, no updatedAt).
export const assetFileResource = z.object({
  id,
  assetId: id,
  versionNumber: z.number().int(),
  storageKey: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  checksum: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  mediaMetadata: z.record(z.string(), z.unknown()),
  createdAt: iso8601,
});
export type AssetFileResource = z.infer<typeof assetFileResource>;

// ProjectAsset extends BaseEntity only.
export const projectAssetResource = z.object({
  id,
  projectId: id,
  assetId: id,
  usageType: z.string(),
});
export type ProjectAssetResource = z.infer<typeof projectAssetResource>;

// ArtifactAsset extends BaseEntity only.
export const artifactAssetResource = z.object({
  id,
  artifactId: id,
  assetId: id,
  usageType: z.string(),
  position: z.number().int(),
});
export type ArtifactAssetResource = z.infer<typeof artifactAssetResource>;

// OutputAsset extends BaseEntity only.
export const outputAssetResource = z.object({
  id,
  contentOutputId: id,
  assetId: id,
  role: z.string(),
});
export type OutputAssetResource = z.infer<typeof outputAssetResource>;
