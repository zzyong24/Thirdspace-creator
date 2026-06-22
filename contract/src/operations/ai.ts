import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, paginationQuery } from "../primitives";
import {
  aiConversationResource,
  aiMessageResource,
  aiTaskResource,
  aiTaskResultResource,
} from "../resources/ai";

const conversationParams = z.object({ conversationId: id });
const taskParams = z.object({ taskId: id });

// SPEC §13 "AI 助手" group.
export const aiOperations = {
  listConversations: defineEndpoint({
    id: "ai.conversations.list",
    method: "GET",
    path: "/ai/conversations",
    query: paginationQuery,
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
      taskType: z.string().min(1),
      inputData: z.record(z.string(), z.unknown()).optional(),
    }),
    response: aiTaskResource,
    fr: ["FR-AI-TASKS-CREATE"],
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
