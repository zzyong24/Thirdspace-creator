import type { InferSelectModel } from "drizzle-orm";
import { pgTable, text, boolean, jsonb } from "drizzle-orm/pg-core";

// Settings tables (data-model USER_PREFERENCE / MODEL_CONFIGURATION /
// AGENT_CONFIGURATION; SPEC §13 "系统" group). Canonical defs live in shared
// infra (@creatoros/backend) because createDb() applies SETTINGS_DDL at init
// alongside PROJECTS_DDL / IDENTITY_DDL / TAXONOMY_DDL / NOTIFICATIONS_DDL /
// SEARCH_DDL (foundation §1: the pglite/Drizzle db factory is the shared-infra
// home). The settings module (frontend/src/server/modules/settings) re-exports
// these so there is ONE source of truth, mirroring identity
// (backend/src/schema/identity.ts ↔ identity.db-schema.ts).
//
// Conventions mirror the Projects/Notifications exemplars: text PKs, ISO-8601
// text timestamps, enums-as-text, jsonb for json columns; every owned row carries
// user_id (foundation §2 ownership).

// USER_PREFERENCE is keyed by user_id (PK=FK per the data-model) — one row per
// user, no own id/timestamps. The repo synthesizes the DTO id as "pref-"+userId.
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id").primaryKey(),
  defaultHome: text("default_home").notNull(),
  defaultCreationMode: text("default_creation_mode").notNull(),
  defaultVisibility: text("default_visibility").notNull(),
  autosaveEnabled: boolean("autosave_enabled").notNull().default(true),
  fileNamingRule: text("file_naming_rule").notNull().default(""),
  analyticsEnabled: boolean("analytics_enabled").notNull().default(true),
});

// MODEL_CONFIGURATION — upsert keyed on (user_id, capability) (the unique index
// below drives putModel's ON CONFLICT). secretReference/settings carry DTO-
// required defaults ("" / {}) when the PUT body omits them.
export const modelConfigurations = pgTable("model_configurations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  capability: text("capability").notNull(),
  provider: text("provider").notNull(),
  modelName: text("model_name").notNull(),
  secretReference: text("secret_reference").notNull().default(""),
  // Inline secret value (the actual key), stored directly in the LOCAL db (the
  // app's end form is a local client — no leak surface). The public DTO masks
  // this to a `hasSecret` boolean and NEVER serializes the raw value.
  secretValue: text("secret_value"),
  settings: jsonb("settings").notNull(),
  baseUrl: text("base_url"),
  apiFormat: text("api_format").notNull().default("anthropic"),
  isDefault: boolean("is_default").notNull().default(false),
});

// STORAGE_CONFIGURATION (item B) — the media-storage binding, keyed by user_id
// (one row per user). `backend` is 'local' | 's3'; `root_path` is the media root
// (empty → the service resolves the default `~/CreatorOS/media`). The repo upserts
// on the user_id PK. No secret/signing material lives here (the blob HMAC secret
// is a process env, not per-user state).
export const storageConfigs = pgTable("storage_configs", {
  userId: text("user_id").primaryKey(),
  backend: text("backend").notNull().default("local"),
  rootPath: text("root_path").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// AGENT_CONFIGURATION — append/create surface (Wave-1 ships create only). Carries
// explicit createdAt/updatedAt (data-model has both).
export const agentConfigurations = pgTable("agent_configurations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  agentType: text("agent_type").notNull(),
  status: text("status").notNull().default("active"),
  capabilities: jsonb("capabilities").notNull(),
  settings: jsonb("settings").notNull(),
  secretReference: text("secret_reference").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// SKILL_CONFIG_OVERRIDE (T-040 / SPEC 2026-07-02 §4.1) — 提示词/skill 服务端可配的持久层。
// 每行覆盖一个已注册 skill(id ∈ registry 的 18 个之一)的部分字段;装配时读全表 →
// 归一空串→undefined → 调 ai-worker 的 `overrideTemplatesFromConfig` 套进常驻 REGISTRY。
// **非 user-scoped**:提示词是产品级系统配置(非用户资产,SPEC §7 Open Q1 默认全局)——不带
// user_id,skill id 即主键。每列可空 = 未配 → 装配期归一后 `?? base` 回退硬编码内置模板。
//   - version:覆盖版本标记(纯审计,可空)。
//   - system / template:覆盖 system 提示 / user template 正文(空/null → 回退内置)。
//   - tools / required_facets:string[](工具白名单 / 必需 facet;null → 回退内置)。
//   - output_schema:JSON Schema(Zod 不可序列化;override 通道经 applySchemaOverride 转回校验器)。
//   - updated_by / updated_at:谁改、何时(updated_at 照 storage_configs 惯例用 ISO TEXT,非 timestamptz)。
export const skillConfigOverrides = pgTable("skill_config_overrides", {
  id: text("id").primaryKey(),
  version: text("version"),
  system: text("system"),
  template: text("template"),
  tools: jsonb("tools"),
  requiredFacets: jsonb("required_facets"),
  outputSchema: jsonb("output_schema"),
  updatedBy: text("updated_by"),
  updatedAt: text("updated_at").notNull(),
});

export type SkillConfigOverrideRow = InferSelectModel<
  typeof skillConfigOverrides
>;

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - model_config_user_capability: the (user_id, capability) unique upsert key
//     putModel's ON CONFLICT DO UPDATE targets.
export const SETTINGS_DDL = `
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  default_home TEXT NOT NULL,
  default_creation_mode TEXT NOT NULL,
  default_visibility TEXT NOT NULL,
  autosave_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  file_naming_rule TEXT NOT NULL DEFAULT '',
  analytics_enabled BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS model_configurations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  secret_reference TEXT NOT NULL DEFAULT '',
  secret_value TEXT,
  settings JSONB NOT NULL,
  base_url TEXT,
  api_format TEXT NOT NULL DEFAULT 'anthropic',
  is_default BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS agent_configurations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  capabilities JSONB NOT NULL,
  settings JSONB NOT NULL,
  secret_reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS model_config_user_capability ON model_configurations (user_id, capability);
CREATE TABLE IF NOT EXISTS storage_configs (
  user_id TEXT PRIMARY KEY,
  backend TEXT NOT NULL DEFAULT 'local',
  root_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_config_overrides (
  id TEXT PRIMARY KEY,
  version TEXT,
  system TEXT,
  template TEXT,
  tools JSONB,
  required_facets JSONB,
  output_schema JSONB,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
`;
