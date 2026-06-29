import { z } from "zod";
import { id, iso8601, aiTaskStatus } from "../primitives";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }. None of the AI
// entities extend Timestamped, but several declare createdAt/updatedAt fields
// explicitly — mapped one-to-one below.

// AIConversation extends BaseEntity (declares createdAt/updatedAt explicitly).
export const aiConversationResource = z.object({
  id,
  userId: id,
  projectId: id.nullable(),
  title: z.string(),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type AIConversationResource = z.infer<typeof aiConversationResource>;

// AIMessageRole, defined locally (not in primitives).
const aiMessageRole = z.enum(["user", "assistant", "system"]);

// AIMessage extends BaseEntity (declares createdAt explicitly).
export const aiMessageResource = z.object({
  id,
  conversationId: id,
  role: aiMessageRole,
  content: z.string(),
  attachments: z.array(id),
  modelMetadata: z.record(z.string(), z.unknown()),
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

// PendingTopicReview (选题弹窗·跨刷新持久缓存) — 当前用户「最近一条待审阅(awaiting_confirmation)
// 的 topic.generate 任务」+ 候选数。候选本就永久存 ai_task_results,这个读 op 只负责让前端刷新
// 页面后仍能定位回那条任务、重读候选、免重复调 AI。无待审阅任务时 review = null。
export const aiPendingTopicReviewResource = z.object({
  review: z
    .object({
      taskId: id,
      basis: z.string(), // 出题依据 positioning|comments|knowledge|trend
      count: z.number().int(), // 该任务候选条数(真来自 result_data.items 长度)
      requestedAt: iso8601,
    })
    .nullable(),
});
export type AIPendingTopicReviewResource = z.infer<
  typeof aiPendingTopicReviewResource
>;

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
