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
  settings: jsonb("settings").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
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
  settings JSONB NOT NULL,
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
`;
