import { z } from "zod";
import { id, iso8601, assetType } from "../primitives.js";

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
