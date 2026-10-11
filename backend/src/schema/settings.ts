import type { InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

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
  // 默认关 —— PROTECTION.md §4「数据上报 · 默认零收集」。隐私优先本地软件,遥测新用户默认 off。
  analyticsEnabled: boolean("analytics_enabled").notNull().default(false),
  assistantExecutionEngine: text("assistant_execution_engine"),
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

// T-645 — 渠道只下发公开模型路由，用户填写的 service Key 仍只保存在本机。
// 以 user + 已验签渠道 scope + service 三元组隔离；不同 capability 共用同一 service 时
// 复用一把 Key，切换渠道不会误读旧 scope。
export const channelModelCredentials = pgTable(
  "channel_model_credentials",
  {
    userId: text("user_id").notNull(),
    scopeId: text("scope_id").notNull(),
    serviceId: text("service_id").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_channel_model_credentials_owner_scope_service").on(
      table.userId,
      table.scopeId,
      table.serviceId,
    ),
  ],
);

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

// [T-165] skill_config_overrides 版本历史 —— 每次 putSkillConfigOverride upsert 追加一条本次
// 生效配置的**快照**(不覆盖历史),供一键回滚(A/B 失败秒回)。additive、独立表、无外键
// (override 行删了历史仍可查/回滚)。overrideId = skill_config_overrides.id;version 同步那次的
// 审计版本号;created_at = 记录时刻(与 override.updated_at 同值,单独列便于按记录序排)。
export const skillConfigOverrideVersions = pgTable(
  "skill_config_override_versions",
  {
    id: text("id").primaryKey(), // deps.nextId("skover")
    overrideId: text("override_id").notNull(),
    version: text("version"),
    system: text("system"),
    template: text("template"),
    tools: jsonb("tools"),
    requiredFacets: jsonb("required_facets"),
    outputSchema: jsonb("output_schema"),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull(),
  },
);

export type SkillConfigOverrideVersionRow = InferSelectModel<
  typeof skillConfigOverrideVersions
>;

// T-513 — 账号增量 Skill 覆盖。旧 skill_config_overrides 只保留作离线人工取证，
// 产品设置/API/运行时不得读取。当前行与历史都携带 user+account+skill 联合归属；
// row_revision 是 CAS token，不是展示版本。
export const accountSkillOverlays = pgTable(
  "account_skill_overlays",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id"),
    groupId: text("group_id"),
    skillId: text("skill_id").notNull(),
    rowRevision: integer("row_revision").notNull(),
    observedBaseVersion: text("observed_base_version").notNull(),
    overlayVersion: text("overlay_version"),
    overlay: jsonb("overlay").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_account_skill_overlays_owner_skill").on(
      table.userId,
      table.accountId,
      table.skillId,
    ),
  ],
);

export const accountSkillOverlayVersions = pgTable(
  "account_skill_overlay_versions",
  {
    id: text("id").primaryKey(),
    overlayId: text("overlay_id").notNull(),
    userId: text("user_id").notNull(),
    accountId: text("account_id"),
    groupId: text("group_id"),
    skillId: text("skill_id").notNull(),
    rowRevision: integer("row_revision").notNull(),
    observedBaseVersion: text("observed_base_version").notNull(),
    overlayVersion: text("overlay_version"),
    overlay: jsonb("overlay").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ux_account_skill_overlay_versions_revision").on(
      table.userId,
      table.accountId,
      table.skillId,
      table.rowRevision,
    ),
  ],
);

// T-1024: consent is distinct from the legacy analyticsEnabled preference.
// An absent row means no grant. Account grants are independent of diagnostics.
export const reportingConsents = pgTable("reporting_consents", {
  userId: text("user_id").notNull(),
  scope: text("scope").notNull(),
  accountId: text("account_id").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  consentVersion: integer("consent_version").notNull(),
  consentEpoch: integer("consent_epoch").notNull().default(0),
  accountAlias: text("account_alias"),
  changedAt: text("changed_at").notNull(),
}, table => [uniqueIndex("reporting_consents_owner_scope_account").on(table.userId, table.scope, table.accountId)]);

export const reportingOutbox = pgTable("reporting_outbox", {
  eventId: text("event_id").primaryKey(),
  userId: text("user_id").notNull(),
  scope: text("scope").notNull(),
  accountId: text("account_id").notNull().default(""),
  workAlias: text("work_alias"),
  consentEpoch: integer("consent_epoch").notNull(),
  encryptedPayload: text("encrypted_payload").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const reportingConsentChanges = pgTable("reporting_consent_changes", {
  userId: text("user_id").notNull(),
  changeId: text("change_id").notNull(),
  scope: text("scope").notNull(),
  accountId: text("account_id").notNull().default(""),
  enabled: boolean("enabled").notNull(),
  changedAt: text("changed_at").notNull(),
}, table => [uniqueIndex("reporting_consent_changes_owner_id").on(table.userId, table.changeId)]);

export type AccountSkillOverlayRow = InferSelectModel<
  typeof accountSkillOverlays
>;
export type AccountSkillOverlayVersionRow = InferSelectModel<
  typeof accountSkillOverlayVersions
>;

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - model_config_user_capability: the (user_id, capability) unique upsert key
//     putModel's ON CONFLICT DO UPDATE targets.
export const groupOnboardingStates=pgTable("group_onboarding_states",{
 userId:text("user_id").notNull(),groupId:text("group_id").notNull(),
 origin:text("origin"),hidden:boolean("hidden").notNull().default(false),collapsed:boolean("collapsed").notNull().default(true),
 completedSteps:jsonb("completed_steps").notNull().default([]),updatedAt:text("updated_at").notNull(),
},table=>[primaryKey({columns:[table.userId,table.groupId]})]);

export const SETTINGS_DDL = `
CREATE TABLE IF NOT EXISTS group_onboarding_states (
 user_id text NOT NULL, group_id text NOT NULL,
 origin text CHECK(origin IN ('fresh','existing')),
 hidden boolean NOT NULL DEFAULT false, collapsed boolean NOT NULL DEFAULT true,
 completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(completed_steps)='array'),
 updated_at text NOT NULL, PRIMARY KEY(user_id,group_id)
);

CREATE TABLE IF NOT EXISTS redfox_submissions (user_id text NOT NULL, input_hash text NOT NULL, fingerprint text NOT NULL, call_id text NOT NULL, task_id text, observation jsonb, PRIMARY KEY(user_id,input_hash));
CREATE TABLE IF NOT EXISTS integration_credentials (user_id text NOT NULL, provider text NOT NULL, encrypted_secret text NOT NULL, updated_at text NOT NULL, PRIMARY KEY(user_id,provider));
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  default_home TEXT NOT NULL,
  default_creation_mode TEXT NOT NULL,
  default_visibility TEXT NOT NULL,
  autosave_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  file_naming_rule TEXT NOT NULL DEFAULT '',
  analytics_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  assistant_execution_engine TEXT CHECK (assistant_execution_engine IN ('pi', 'codex'))
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
CREATE TABLE IF NOT EXISTS channel_model_credentials (
  user_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, scope_id, service_id)
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
CREATE TABLE IF NOT EXISTS account_skill_overlays (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  row_revision INTEGER NOT NULL CHECK (row_revision >= 1),
  observed_base_version TEXT NOT NULL,
  overlay_version TEXT,
  overlay JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, account_id, skill_id)
);
CREATE TABLE IF NOT EXISTS account_skill_overlay_versions (
  id TEXT PRIMARY KEY,
  overlay_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  row_revision INTEGER NOT NULL CHECK (row_revision >= 1),
  observed_base_version TEXT NOT NULL,
  overlay_version TEXT,
  overlay JSONB NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, account_id, skill_id, row_revision)
);
CREATE TABLE IF NOT EXISTS reporting_consents (
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('diagnostics','creator')),
  account_id TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  consent_version INTEGER NOT NULL,
  consent_epoch INTEGER NOT NULL DEFAULT 0,
  account_alias TEXT,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, scope, account_id)
);
CREATE TABLE IF NOT EXISTS reporting_outbox (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  work_alias TEXT,
  consent_epoch INTEGER NOT NULL,
  encrypted_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reporting_outbox_owner_scope ON reporting_outbox(user_id,scope,account_id,created_at);
CREATE TABLE IF NOT EXISTS reporting_consent_changes (
  user_id TEXT NOT NULL,
  change_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, change_id)
);
`;
