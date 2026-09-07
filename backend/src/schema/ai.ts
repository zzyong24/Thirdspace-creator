import { pgTable, text, jsonb, real, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { executionTasks, executionCalls } from "./intelligence";

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
  // [T-136 多账号 · OQ2 裁决=按号切] AI 编导对话按号隔离(切号=换对话桶)。nullable 稳定终态。
  // 子表 ai_messages 经 requireConversation 门透传属主,不加 account_id。
  accountId: text("account_id").notNull(),
  projectId: text("project_id"), // nullable
  // T-096 会话作用域(SPEC 2026-07-03 chat-session-scope-contract §1.1)—— 入口级隔离与延续的
  // 一等公民字段。文法:'global' | 'project:<id>' | 'surface:<name>'(<name>:<entityId> 扩展位
  // 本期只定文法不启用)。历史列表按它过滤、恢复按它取最近、/api/chat 续接按它校验。
  scope: text("scope").notNull().default("global"),
  title: text("title").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiMessages = pgTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(), // owned via requireConversation
  role: text("role").notNull(), // user | assistant | system
  content: text("content").notNull().default(""),
  // [T-128] parts:落库的 useChat UIMessage parts(text + tool-result 部件)。刷新后恢复据它重建
  // message.parts → 复用现有候选卡/素材卡/审核报告卡渲染分支(此前只存 content,tool-result 卡丢)。
  // additive、default '[]':存量行读到空数组 → 前端 toUIMessages 回落 content 文本气泡。
  parts: jsonb("parts").notNull().default([]),
  attachments: jsonb("attachments").notNull().default([]),
  modelMetadata: jsonb("model_metadata").notNull().default({}),
  // [T-239e] 用量可见:assistant 行随 streamText totalUsage 落 token 计数(user 行/老行 NULL)。
  // additive nullable —— 存量行读回 null,读侧/前端角标按 null 兼容(不计入累计、不崩)。
  // cachedTokens = usage.inputTokenDetails.cacheReadTokens(命中缓存的输入 token,省钱信号)。
  // modelKey = 本轮计费主体；本地配置记 ModelSpec.model，渠道托管配置只记 channel-managed。
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cachedTokens: integer("cached_tokens"),
  modelKey: text("model_key"),
  createdAt: text("created_at").notNull(),
});

export const aiTasks = pgTable("ai_tasks", {
  id: text("id").primaryKey(),
  executionTaskId: text("execution_task_id").references(() => executionTasks.id).unique("ai_tasks_execution_task_id_unique"),
  userId: text("user_id").notNull(), // ownership boundary (owned-root)
  // [T-136 多账号 · OQ2 裁决=按号切] AI 任务按号隔离。nullable 稳定终态。子表
  // ai_task_references/results/steps 经 requireTask 门透传属主,不加 account_id。
  accountId: text("account_id").notNull(),
  projectId: text("project_id"), // nullable
  contentOutputId: text("content_output_id"), // nullable
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default("queued"),
  inputData: jsonb("input_data").notNull().default({}),
  // [T-513] 运行快照只存在 server-only runtime_data；DTO mapper 永不投影该列。
  runtimeData: jsonb("runtime_data").notNull().default({}),
  modelKey: text("model_key").notNull().default(""),
  idempotencyKey: text("idempotency_key").notNull(),
  // DB defaults only protect legacy/internal direct inserts during rollout. The public
  // service always supplies the contract attempt/fingerprint explicitly.
  attemptId: text("attempt_id")
    .notNull()
    .default(sql`gen_random_uuid()::text`),
  requestFingerprint: text("request_fingerprint")
    .notNull()
    .default(sql`'sha256:' || repeat('0', 64)`),
  retryOfTaskId: text("retry_of_task_id"),
  requestedAt: text("requested_at").notNull(),
  startedAt: text("started_at"), // nullable until claimed/running
  completedAt: text("completed_at"), // nullable until terminal
  errorMessage: text("error_message"), // nullable
  sessionId: text("session_id"), // nullable — Agent SDK resume (ports.ts AiTaskRecord)
  costUsd: real("cost_usd"), // nullable — recorded run cost
  leaseOwner: text("lease_owner"),
  leaseToken: text("lease_token"),
  leaseExpiresAt: text("lease_expires_at"),
  modelCallStartedAt: text("model_call_started_at"),
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
  executionCallId: text("execution_call_id").references(() => executionCalls.id).unique("ai_task_results_execution_call_unique"),
  aiTaskId: text("ai_task_id").notNull(), // owned via requireTask
  resultType: text("result_type").notNull(),
  artifactId: text("artifact_id"), // nullable
  knowledgeItemId: text("knowledge_item_id"), // nullable
  assetId: text("asset_id"), // nullable
  resultData: jsonb("result_data").notNull().default({}),
});

// ai_task_steps (Phase 3, Agent Runtime 步骤流) — 一个 ai_task 一次运行里逐步产生的过程事件
// (想了什么/调了什么工具/最终)。子表,无 user_id:经 requireTask 的 ownership gate 到达。
// 喂「窗口步骤日志」+ 审计。runtime 的 AgentStepEvent → 一行。
export const aiTaskSteps = pgTable("ai_task_steps", {
  id: text("id").primaryKey(),
  aiTaskId: text("ai_task_id").notNull(), // owned via requireTask
  stepNo: integer("step_no").notNull(),
  kind: text("kind").notNull().default("step"), // step | tool_call | final
  text: text("text").notNull().default(""),
  toolCalls: jsonb("tool_calls").notNull().default([]),
  createdAt: text("created_at").notNull(),
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
  account_id TEXT NOT NULL,
  project_id TEXT,
  scope TEXT NOT NULL DEFAULT 'global',
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_scope ON ai_conversations (user_id, scope, updated_at);
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages (conversation_id, created_at);
CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  project_id TEXT,
  content_output_id TEXT,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_key TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  attempt_id TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  request_fingerprint TEXT NOT NULL DEFAULT ('sha256:' || repeat('0', 64)),
  retry_of_task_id TEXT,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  session_id TEXT,
  cost_usd REAL,
  lease_owner TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  model_call_started_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_attempt_identity
  ON ai_tasks (user_id, account_id, task_type, attempt_id);
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
CREATE TABLE IF NOT EXISTS ai_task_steps (
  id TEXT PRIMARY KEY,
  ai_task_id TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'step',
  text TEXT NOT NULL DEFAULT '',
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_task_steps_task ON ai_task_steps (ai_task_id, step_no);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_task_model_call_started
  ON ai_task_steps (ai_task_id) WHERE kind = 'model_call_started';
-- [T-136 多账号 · OQ2] ai_conversations/ai_tasks 按号隔离列(additive、幂等)。存量行 NULL,
-- 迁移 0025 backfill 默认号。切号 = 换对话桶(§B 启用 chat-scope 的 account:<id> 维度,后续切片)。
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS runtime_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS attempt_id TEXT;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS retry_of_task_id TEXT;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS lease_owner TEXT;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS lease_token TEXT;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS lease_expires_at TEXT;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS model_call_started_at TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_account ON ai_conversations (user_id, account_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_account ON ai_tasks (user_id, account_id);
`;

// 请求回执不复制执行状态，也不级联删除；原任务删除后禁止旧请求重建它。
export const projectTranscriptionRequests = pgTable("project_transcription_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  attemptId: text("attempt_id").notNull(),
  projectId: text("project_id").notNull(),
  awemeId: text("aweme_id").notNull(),
  aiTaskId: text("ai_task_id").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("project_transcription_requests_user_id_account_id_attempt_id_key").on(table.userId, table.accountId, table.attemptId)]);
