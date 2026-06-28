import { z } from "zod";
import { id, iso8601, creationMode } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// Visibility is not exported by primitives.ts; define locally from domain.ts.
const visibility = z.enum(["private", "unlisted", "public"]);

// User extends BaseEntity, Timestamped.
export const userResource = z.object({
  id,
  email: z.string(),
  displayName: z.string(),
  timezone: z.string(),
  locale: z.string(),
  ...timestamps,
});
export type UserResource = z.infer<typeof userResource>;

// UserPreference extends BaseEntity only (no Timestamped).
export const userPreferenceResource = z.object({
  id,
  userId: id,
  defaultHome: z.string(),
  defaultCreationMode: creationMode,
  defaultVisibility: visibility,
  autosaveEnabled: z.boolean(),
  fileNamingRule: z.string(),
  analyticsEnabled: z.boolean(),
});
export type UserPreferenceResource = z.infer<typeof userPreferenceResource>;

// ModelConfiguration extends BaseEntity only (no Timestamped).
export const modelConfigurationResource = z.object({
  id,
  userId: id,
  capability: z.string(),
  provider: z.string(),
  modelName: z.string(),
  secretReference: z.string(),
  baseUrl: z.string().nullable(),
  apiFormat: z.enum(["anthropic", "openai_chat"]),
  settings: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
  // Masked indicator: a usable secret is configured (stored value OR env-ref).
  // The raw secret is NEVER serialized to the client — only this boolean.
  hasSecret: z.boolean(),
});
export type ModelConfigurationResource = z.infer<
  typeof modelConfigurationResource
>;

// StorageConfiguration — the media-storage binding (item B). `backend`/`rootPath`
// are the editable config; `usedBytes`/`totalBytes`/`breakdown` are read-only
// real usage (computed from asset_files + the disk that holds `rootPath`). The
// raw secret / signing material is NEVER part of this DTO — only the backend
// choice + resolved root path are surfaced.
export const storageConfigResource = z.object({
  backend: z.enum(["local", "s3"]),
  // The resolved absolute media root (default `~/CreatorOS/media` when unset).
  rootPath: z.string(),
  // Real bytes consumed by the user's asset files (SUM(file_size)).
  usedBytes: z.number(),
  // Capacity of the disk that holds `rootPath` (fs.statfs); 0 if unknown.
  totalBytes: z.number(),
  // Per-asset-type usage (drives the StorageUsageCard breakdown rows).
  breakdown: z.array(
    z.object({
      assetType: z.string(),
      bytes: z.number(),
    }),
  ),
});
export type StorageConfigResource = z.infer<typeof storageConfigResource>;

// AgentConfiguration extends BaseEntity only; carries explicit createdAt/updatedAt.
export const agentConfigurationResource = z.object({
  id,
  userId: id,
  name: z.string(),
  agentType: z.string(),
  status: z.string(),
  capabilities: z.record(z.string(), z.unknown()),
  settings: z.record(z.string(), z.unknown()),
  secretReference: z.string(),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type AgentConfigurationResource = z.infer<
  typeof agentConfigurationResource
>;
