import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  aiConversationResource,
  aiMessageResource,
  aiTaskResource,
  aiTaskResultResource,
  aiTaskStepResource,
} from "../resources/ai";

const conversationParams = z.object({ conversationId: id });
const taskParams = z.object({ taskId: id });

// SPEC §13 "AI 助手" group.
export const aiOperations = {
  listConversations: defineEndpoint({
    id: "ai.conversations.list",
    method: "GET",
    path: "/ai/conversations",
    // T-096(additive,gate-F3 契约零删除):scope 可选过滤 —— 传了只列该作用域的会话
    // (入口级历史隔离),不传维持全量(旧调用零破坏)。
    query: paginationQuery.extend({ scope: z.string().optional() }),
    response: aiConversationResource,
    isList: true,
    fr: ["FR-AI-CONVERSATIONS-LIST"],
  }),
  createConversation: defineEndpoint({
    id: "ai.conversations.create",
    method: "POST",
    path: "/ai/conversations",
    body: z.object({
      title: z.string().min(1),
      projectId: id.nullable().optional(),
      // T-096(additive):会话作用域,缺省服务端落 'global'。
      scope: z.string().optional(),
    }),
    response: aiConversationResource,
    fr: ["FR-AI-CONVERSATIONS-CREATE"],
  }),
  createMessage: defineEndpoint({
    id: "ai.conversations.messages.create",
    method: "POST",
    path: "/ai/conversations/:conversationId/messages",
    params: conversationParams,
    body: z.object({
      content: z.string().min(1),
      attachments: z.array(id).optional(),
    }),
    response: aiMessageResource,
    fr: ["FR-AI-MESSAGES-CREATE"],
  }),
  listMessages: defineEndpoint({
    id: "ai.conversations.messages.list",
    method: "GET",
    path: "/ai/conversations/:conversationId/messages",
    params: conversationParams,
    response: aiMessageResource,
    isList: true,
    fr: ["FR-AI-MESSAGES-LIST"],
  }),
  createAITask: defineEndpoint({
    id: "ai.tasks.create",
    method: "POST",
    path: "/ai/tasks",
    body: z.object({
      taskType: z.string().min(1).refine(value=>value!=="asset.asr"&&value!=="production.rough-cut.propose","资产转写或粗剪须从生产预约创建"),
      attemptId: z.string().min(16).max(128),
      retryOfTaskId: id.optional(),
      inputData: z.record(z.string(), z.unknown()).optional(),
    }),
    response: aiTaskResource,
    fr: ["FR-AI-TASKS-CREATE"],
  }),
  listAITasks: defineEndpoint({
    id: "ai.tasks.list",
    method: "GET",
    path: "/ai/tasks",
    // [T-116c] additive 读过滤(纯读、不改数据归属/schema、无需过 gate):可选
    // projectId + taskType —— 复盘页 AI 分析卡据此取「本条视频的 review.analyze
    // 最近一次结果」而非全站 learnings。都不传 → 维持全量任务馈(copilot「最近任务」),
    // 旧调用零破坏。
    query: paginationQuery.extend({
      projectId: id.optional(),
      taskType: z.string().optional(),
    }),
    response: aiTaskResource,
    isList: true,
    fr: ["FR-AI-TASKS-LIST"],
  }),
  getTask: defineEndpoint({
    id: "ai.tasks.get",
    method: "GET",
    path: "/ai/tasks/:taskId",
    params: taskParams,
    response: aiTaskResource,
    fr: ["FR-AI-TASKS-GET"],
  }),
  listTaskResults: defineEndpoint({
    id: "ai.tasks.results.list",
    method: "GET",
    path: "/ai/tasks/:taskId/results",
    params: taskParams,
    response: aiTaskResultResource,
    isList: true,
    fr: ["FR-AI-TASKS-RESULTS-LIST"],
  }),
  listTaskSteps: defineEndpoint({
    id: "ai.tasks.steps.list",
    method: "GET",
    path: "/ai/tasks/:taskId/steps",
    params: taskParams,
    response: aiTaskStepResource,
    isList: true,
    fr: ["FR-AI-TASKS-RESULTS-LIST"],
  }),
  // [T-248 批C] ai.tasks.pending_topic_review 已删 —— T-060 弹窗任务流退役后零调用方
  // (对话内 ChatCandidateCard 即出即采,无「待审阅弹窗」概念)。
  // CollabField(COLLAB-02):采纳前人可逐条编辑/删候选 —— 替换最新结果的 items,再 confirm 物化。
  // 让所有 list 类 AI 节点(选题/素材/复盘/发布候选)的 AI 产物"人可改",不再全有或全无。
  patchTaskResultItems: defineEndpoint({
    id: "ai.tasks.results.patch",
    method: "POST",
    path: "/ai/tasks/:taskId/results/patch",
    params: taskParams,
    body: z.object({ items: z.array(z.unknown()) }),
    response: aiTaskResultResource,
    fr: ["FR-AI-TASKS-RESULTS-LIST"],
  }),
  confirmTask: defineEndpoint({
    id: "ai.tasks.confirm",
    method: "POST",
    path: "/ai/tasks/:taskId/confirm",
    params: taskParams,
    response: aiTaskResource,
    fr: ["FR-AI-TASKS-CONFIRM"],
  }),
  cancelTask: defineEndpoint({
    id: "ai.tasks.cancel",
    method: "POST",
    path: "/ai/tasks/:taskId/cancel",
    params: taskParams,
    response: aiTaskResource,
    fr: ["FR-AI-TASKS-CANCEL"],
  }),
} as const;
