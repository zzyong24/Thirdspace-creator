import { z } from "zod";
import { id, iso8601, aiTaskStatus } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }. None of the AI
// entities extend Timestamped, but several declare createdAt/updatedAt fields
// explicitly — mapped one-to-one below.

// AIConversation extends BaseEntity (declares createdAt/updatedAt explicitly).
// T-096:scope = 会话作用域(入口级隔离与延续的归属命名,SPEC 2026-07-03 §1.1)。
// 文法:'global' | 'project:<id>' | 'surface:<name>'(<name>:<entityId> 扩展位本期只定文法)。
export const aiConversationResource = z.object({
  id,
  userId: id,
  projectId: id.nullable(),
  scope: z.string(),
  title: z.string(),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type AIConversationResource = z.infer<typeof aiConversationResource>;

// AIMessageRole, defined locally (not in primitives).
const aiMessageRole = z.enum(["user", "assistant", "system"]);

// AIMessage extends BaseEntity (declares createdAt explicitly).
// [T-128] parts:落库的 useChat UIMessage parts(text + tool-result 部件)。刷新后会话恢复据它
// 重建 message.parts → 复用 ai-copilot-content 的候选卡/素材卡/审核报告卡渲染分支(此前只存
// content 纯文本,tool-result 卡在存那刻就丢)。additive、default([]):存量行/旧客户端读到空
// 数组 → toUIMessages 回落 content 文本气泡(向后兼容)。
export const aiMessageResource = z.object({
  id,
  conversationId: id,
  role: aiMessageRole,
  content: z.string(),
  parts: z.array(z.unknown()).default([]),
  attachments: z.array(id),
  modelMetadata: z.record(z.string(), z.unknown()),
  // [T-239e] 用量可见:assistant 行的 token 计数(streamText totalUsage 投影)。additive、
  // nullable + default(null):存量行/老后端读到 null → 前端会话成本角标跳过不计(不崩)。
  // cachedTokens = 命中缓存的输入 token(inputTokenDetails.cacheReadTokens);modelKey = 本轮
  // 实际用的模型 id。user 行恒 null(用量只属 assistant 回复轮)。
  inputTokens: z.number().int().nullable().default(null),
  outputTokens: z.number().int().nullable().default(null),
  cachedTokens: z.number().int().nullable().default(null),
  modelKey: z.string().nullable().default(null),
  createdAt: iso8601,
});
export type AIMessageResource = z.infer<typeof aiMessageResource>;

// AITask extends BaseEntity (declares its own timestamp fields explicitly).
export const aiTaskResource = z.object({
  id,
  userId: id,
  projectId: id.nullable(),
  contentOutputId: id.nullable(),
  taskType: z.string(),
  status: aiTaskStatus,
  inputData: z.record(z.string(), z.unknown()),
  modelKey: z.string(),
  idempotencyKey: z.string(),
  requestedAt: iso8601,
  startedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
  errorMessage: z.string().nullable(),
});
export type AITaskResource = z.infer<typeof aiTaskResource>;

// AITaskReference extends BaseEntity only.
export const aiTaskReferenceResource = z.object({
  id,
  aiTaskId: id,
  entityType: z.string(),
  entityId: id,
  relationType: z.string(),
});
export type AITaskReferenceResource = z.infer<typeof aiTaskReferenceResource>;

// AITaskResult extends BaseEntity only.
export const aiTaskResultResource = z.object({
  id,
  aiTaskId: id,
  resultType: z.string(),
  artifactId: id.nullable(),
  knowledgeItemId: id.nullable(),
  assetId: id.nullable(),
  resultData: z.record(z.string(), z.unknown()),
});
export type AITaskResultResource = z.infer<typeof aiTaskResultResource>;

// AITaskStep (Phase 3 Agent Runtime 步骤流) — 一次 agent 运行逐步产生的过程事件,喂窗口步骤
// 日志(第1步读人设 / 第2步搜热点…)。read-only,按 stepNo 升序。
export const aiTaskStepResource = z.object({
  stepNo: z.number().int(),
  kind: z.string(), // step | tool_call | final
  text: z.string(),
  toolCalls: z.array(z.unknown()),
  createdAt: iso8601,
});
export type AITaskStepResource = z.infer<typeof aiTaskStepResource>;

// [T-248 批C] aiPendingTopicReviewResource 已删 —— 唯一消费方 op
// ai.tasks.pending_topic_review 随 T-060 弹窗任务流退役而移除。

// AgentConfiguration extends BaseEntity (declares createdAt/updatedAt explicitly).
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

// ModelConfiguration extends BaseEntity only.
export const modelConfigurationResource = z.object({
  id,
  userId: id,
  capability: z.string(),
  provider: z.string(),
  modelName: z.string(),
  secretReference: z.string(),
  settings: z.record(z.string(), z.unknown()),
  isDefault: z.boolean(),
});
export type ModelConfigurationResource = z.infer<
  typeof modelConfigurationResource
>;
