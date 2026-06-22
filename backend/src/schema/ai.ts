import { pgTable, text, jsonb, real } from "drizzle-orm/pg-core";

// AI tables (Module 15; data-model §7 ER "AI、搜索和系统"; contract/src/resources/ai.ts;
// SPEC §12 AI Task state machine / §18 candidate-confirm). The canonical defs live in
// shared infra (@creatoros/backend) because createDb() applies AI_DDL at init alongside
// PROJECTS_DDL / ARTIFACTS_DDL / … (foundation §1: the pglite/Drizzle db factory is the
// shared-infra home). The AI module (frontend/src/server/modules/ai) re-exports these so
// there is ONE source of truth, mirroring learnings (schema/learnings.ts ↔ db-schema.ts).
//
// Ownership (foundation §2 / SPEC §10/§20): owned-ROOT tables (ai_conversations,
// ai_tasks) carry a denormalized `user_id TEXT NOT NULL` stamped at write time from
// ctx.userId. Child tables (ai_messages, ai_task_references, ai_task_results) carry NO
// user_id — they are reached ONLY through their parent's ownership gate
// (requireConversation / requireTask filter eq(parent.userId, ctx.userId)), so a child
// row is never reachable cross-user.
//
// AgentConfiguration / ModelConfiguration are NOT redefined here — they already exist as
// shared tables in schema/settings.ts (agent_configurations / model_configurations). The
// AI module reads them user-scoped for worker model/skill routing; Step 3 seeds the
// per-capability rows through the settings tables.
//
// Conventions mirror the Projects/Learnings exemplars: text PKs, ISO-8601 text
// timestamps, enums/status as text validated by the contract Zod on output, jsonb for
// json columns, `real` for the recorded run cost.
//
// AI Task state machine (SPEC §12 / state-machine.ts / contract aiTaskStatus enum):
//   queued → running | cancelled ; running → awaiting_confirmation | succeeded | failed |
//   cancelled ; awaiting_confirmation → succeeded | cancelled. Terminals
//   (succeeded/failed/cancelled) are empty. The guard lives in the service, not the schema.

export const aiConversations = pgTable("ai_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // ownership boundary (owned-root)
  projectId: text("project_id"), // nullable
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiMessages = pgTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(), // owned via requireConversation
  role: text("role").notNull(), // user | assistant | system
  content: text("content").notNull().default(""),
  attachments: jsonb("attachments").notNull().default([]),
  modelMetadata: jsonb("model_metadata").notNull().default({}),
  createdAt: text("created_at").notNull(),
});

export const aiTasks = pgTable("ai_tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(), // ownership boundary (owned-root)
  projectId: text("project_id"), // nullable
  contentOutputId: text("content_output_id"), // nullable
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default("queued"),
  inputData: jsonb("input_data").notNull().default({}),
  modelKey: text("model_key").notNull().default(""),
  idempotencyKey: text("idempotency_key").notNull(),
  requestedAt: text("requested_at").notNull(),
  startedAt: text("started_at"), // nullable until claimed/running
  completedAt: text("completed_at"), // nullable until terminal
  errorMessage: text("error_message"), // nullable
  sessionId: text("session_id"), // nullable — Agent SDK resume (ports.ts AiTaskRecord)
  costUsd: real("cost_usd"), // nullable — recorded run cost
});

export const aiTaskReferences = pgTable("ai_task_references", {
  id: text("id").primaryKey(),
  aiTaskId: text("ai_task_id").notNull(), // owned via requireTask
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  relationType: text("relation_type").notNull(),
});

export const aiTaskResults = pgTable("ai_task_results", {
  id: text("id").primaryKey(),
  aiTaskId: text("ai_task_id").notNull(), // owned via requireTask
  resultType: text("result_type").notNull(),
  artifactId: text("artifact_id"), // nullable
  knowledgeItemId: text("knowledge_item_id"), // nullable
  assetId: text("asset_id"), // nullable
  resultData: jsonb("result_data").notNull().default({}),
});

// Raw DDL applied at db init (pglite has no migration runner wired here yet).
//   - idx_ai_conversations_user: backs listConversations (user + updatedAt order).
//   - idx_ai_messages_conversation: backs listMessages (per-conversation order).
//   - ai_tasks_user_idempotency: the (user_id, idempotency_key) unique key the
//     idempotent createTask relies on (design-spec §7 — a duplicate returns the
//     existing task; claim-by-update is idempotency-safe).
//   - idx_ai_tasks_status: backs the worker's claimNextQueued scan.
//   - idx_ai_task_refs_task / idx_ai_task_results_task: per-task child lookups.
export const AI_DDL = `
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at);
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages (conversation_id, created_at);
CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  content_output_id TEXT,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_key TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  session_id TEXT,
  cost_usd REAL
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_user_idempotency ON ai_tasks (user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks (status);
CREATE TABLE IF NOT EXISTS ai_task_references (
  id TEXT PRIMARY KEY,
  ai_task_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_task_refs_task ON ai_task_references (ai_task_id);
CREATE TABLE IF NOT EXISTS ai_task_results (
  id TEXT PRIMARY KEY,
  ai_task_id TEXT NOT NULL,
  result_type TEXT NOT NULL,
  artifact_id TEXT,
  knowledge_item_id TEXT,
  asset_id TEXT,
  result_data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ai_task_results_task ON ai_task_results (ai_task_id);
`;
