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
  apiFormat: z.enum(["anthropic", "openai_chat", "openai_responses"]),
  settings: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
  // Masked indicator: a usable secret is configured (stored value OR env-ref).
  // The raw secret is NEVER serialized to the client — only this boolean.
  hasSecret: z.boolean(),
  // [T-453] "曾配但密钥不可用" —— decRow 在 master key 变化时把 secret_value 标记为
  //   sentinel(`dec-fail:v1`)。true = 用户下次读时应看到「密钥失效,请重填」提示,而非
  //   与"从未配"混淆。可选:老快照 / 未启用加密路径 未设,默认 false。
  secretDecryptFailed: z.boolean().optional(),
});
export type ModelConfigurationResource = z.infer<
  typeof modelConfigurationResource
>;

// T-645 — 渠道 service Key 的公开状态。明文 Key、scopeId 与渠道 identity 永不出 Web。
export const channelModelCredentialResource = z.object({
  serviceId: z.string().min(1),
  hasSecret: z.boolean(),
  updatedAt: iso8601.nullable(),
});
export type ChannelModelCredentialResource = z.infer<
  typeof channelModelCredentialResource
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

// SkillConfigOverride (T-040 / SPEC 2026-07-02 §4.1) — one server-side override of
// a registered skill's prompt config (id ∈ the 18 registered templates). Every
// override field is nullable = 未配 → 装配期归一 undefined → `?? base` 回退内置模板.
// `id` is the skill id (the PK — NOT user-scoped; 提示词是产品级系统配置). `version`
// is a plain audit marker bumped on each write. `tools`/`requiredFacets` are string
// whitelists; `outputSchema` is a JSON Schema object (Zod is not serializable —
// the override channel转回 ajv 校验器 at assembly). The raw secret is never part of
// this DTO (prompts carry no secret).
export const skillConfigOverrideResource = z.object({
  id: z.string(),
  version: z.string().nullable(),
  system: z.string().nullable(),
  template: z.string().nullable(),
  tools: z.array(z.string()).nullable(),
  requiredFacets: z.array(z.string()).nullable(),
  outputSchema: z.record(z.string(), z.unknown()).nullable(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string(),
});
export type SkillConfigOverrideResource = z.infer<
  typeof skillConfigOverrideResource
>;

// [T-165] skill_config_overrides 的一条历史版本快照(供版本历史列表 + 一键回滚)。
export const skillConfigOverrideVersionResource = z.object({
  id: z.string(),
  overrideId: z.string(),
  version: z.string().nullable(),
  system: z.string().nullable(),
  template: z.string().nullable(),
  tools: z.array(z.string()).nullable(),
  requiredFacets: z.array(z.string()).nullable(),
  outputSchema: z.record(z.string(), z.unknown()).nullable(),
  updatedBy: z.string().nullable(),
  createdAt: z.string(),
});
export type SkillConfigOverrideVersionResource = z.infer<
  typeof skillConfigOverrideVersionResource
>;

// T-513 — 账号增量 Skill 覆盖。旧 global SkillConfigOverride DTO 仅保留给离线取证代码；
// settings.prompts.* 的公开 contract 改用以下联合归属资源。
export const completionPolicyV1Resource = z
  .object({
    schemaVersion: z.literal(1),
    minSegments: z.number().int().min(1).max(100),
    maxSegments: z.number().int().min(1).max(100).nullable(),
    requiredSequence: z
      .array(z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/))
      .max(20),
    repairAttempts: z.number().int().min(0).max(3),
  })
  .refine(
    (value) =>
      value.maxSegments === null || value.maxSegments >= value.minSegments,
    { message: "maxSegments 必须不小于 minSegments", path: ["maxSegments"] },
  );
export type CompletionPolicyV1Resource = z.infer<
  typeof completionPolicyV1Resource
>;

export const accountSkillOverlayPatchResource = z.object({
  system: z.string().nullable().optional(),
  template: z.string().nullable().optional(),
  tools: z.array(z.string()).nullable().optional(),
  requiredFacets: z.array(z.string()).nullable().optional(),
  outputSchema: z.record(z.string(), z.unknown()).nullable().optional(),
  completionPolicy: completionPolicyV1Resource.nullable().optional(),
});
export type AccountSkillOverlayPatchResource = z.infer<
  typeof accountSkillOverlayPatchResource
>;

export const editableSkillValuesResource = z.object({
  system: z.string(),
  template: z.string(),
  tools: z.array(z.string()),
  requiredFacets: z.array(z.string()),
  outputSchema: z.record(z.string(), z.unknown()).nullable(),
  completionPolicy: completionPolicyV1Resource.nullable(),
});

export const accountSkillOverlayCompatibilityErrorResource = z.object({
  code: z.enum([
    "TOOL_REMOVED",
    "OUTPUT_SCHEMA_INVALID",
    "COMPLETION_POLICY_INVALID",
    "COMPLETION_POLICY_UNSUPPORTED",
    "REQUIRED_FACET_INVALID",
    "FIELD_NOT_EDITABLE",
  ]),
  path: z.string(),
  message: z.string(),
});

export const accountSkillOverlayResource = z.object({
  skillId: z.string().min(1),
  // Official catalog is readable before a platform account is selected.
  // null means no account overlay is in scope; writes remain account-required.
  accountId: z.string().min(1).nullable(),
  baseVersion: z.string().min(1),
  editableFields: z.array(
    z.enum([
      "system",
      "template",
      "tools",
      "requiredFacets",
      "outputSchema",
      "completionPolicy",
    ]),
  ),
  completionPolicySupported: z.boolean(),
  official: editableSkillValuesResource,
  effective: editableSkillValuesResource,
  compatibility: z.enum(["compatible", "incompatible"]),
  compatibilityErrors: z.array(
    accountSkillOverlayCompatibilityErrorResource,
  ),
  rowRevision: z.number().int().min(1).nullable(),
  validatedBaseVersion: z.string().nullable(),
  overlayVersion: z.string().nullable(),
  overlay: accountSkillOverlayPatchResource.nullable(),
  updatedAt: iso8601.nullable(),
});
export type AccountSkillOverlayResource = z.infer<
  typeof accountSkillOverlayResource
>;

export const accountSkillOverlayVersionResource = z.object({
  id: z.string().min(1),
  skillId: z.string().min(1),
  accountId: z.string().min(1),
  rowRevision: z.number().int().min(1),
  observedBaseVersion: z.string().min(1),
  overlayVersion: z.string().nullable(),
  overlay: accountSkillOverlayPatchResource,
  savedCompatibility: z.literal("compatible"),
  currentCompatibility: z.enum(["compatible", "incompatible"]),
  currentCompatibilityErrors: z.array(
    accountSkillOverlayCompatibilityErrorResource,
  ),
  updatedBy: z.string().min(1),
  createdAt: iso8601,
});
export type AccountSkillOverlayVersionResource = z.infer<
  typeof accountSkillOverlayVersionResource
>;

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
