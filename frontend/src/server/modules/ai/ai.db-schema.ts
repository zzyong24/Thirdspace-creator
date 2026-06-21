// AI Drizzle tables + DDL. The canonical definitions live in shared infra
// (@creatoros/backend) because createDb() applies AI_DDL at init alongside
// PROJECTS_DDL / ARTIFACTS_DDL / LEARNINGS_DDL / … (foundation §1: the pglite/Drizzle
// db factory is the shared-infra home). This module file is the in-module surface the
// repository imports; re-exporting keeps ONE source of truth for the schema (mirrors
// learnings.db-schema.ts ↔ backend/src/schema/ai.ts).
//
// AgentConfiguration / ModelConfiguration are NOT redefined here — the worker reads the
// shared settings tables (agent_configurations / model_configurations); the AI
// repository imports them from @creatoros/backend for its user-scoped config lookups.
export {
  aiConversations,
  aiMessages,
  aiTasks,
  aiTaskReferences,
  aiTaskResults,
  agentConfigurations,
  modelConfigurations,
  AI_DDL,
} from "@creatoros/backend";
