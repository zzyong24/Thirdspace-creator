// Settings Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies SETTINGS_DDL at init alongside
// PROJECTS_DDL / IDENTITY_DDL / TAXONOMY_DDL / NOTIFICATIONS_DDL / SEARCH_DDL
// (foundation §1: the pglite/Drizzle db factory is the shared-infra home). This
// module file is the in-module surface the repository imports; re-exporting keeps
// ONE source of truth for the schema (mirrors identity.db-schema.ts ↔
// backend/src/schema/identity.ts).
export {
  userPreferences,
  modelConfigurations,
  agentConfigurations,
  storageConfigs,
  skillConfigOverrides,
  SETTINGS_DDL,
} from "@creatoros/backend";
export type { SkillConfigOverrideRow } from "@creatoros/backend";
