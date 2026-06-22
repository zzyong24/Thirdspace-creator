// AI module schema surface — the contract Zod DTOs this module produces (foundation
// §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs for this module").
// The transport's mappers and the contract test validate their outputs against these;
// the contract is the single source of truth for the wire shape
// (contract/src/resources/ai.ts).
//
// Topology: the @creatoros/contract root barrel re-exports ENDPOINTS but NOT the
// resource files. The op responses are reachable as ENDPOINTS.<opKey>.response:
//   - listConversations.response === createConversation.response === aiConversationResource
//   - createMessage.response === aiMessageResource
//   - createAITask.response === confirmTask.response === cancelTask.response === aiTaskResource
import { ENDPOINTS } from "@creatoros/contract";
import type {
  ConversationRow,
  MessageRow,
  TaskRow,
  ResultRow,
} from "./ai.repository";

export const aiConversationResource = ENDPOINTS.createConversation.response;
export const aiMessageResource = ENDPOINTS.createMessage.response;
export const aiTaskResource = ENDPOINTS.createAITask.response;
export const aiTaskResultResource = ENDPOINTS.listTaskResults.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// z.infer<T> is T["_output"]). The frontend package does not declare `zod` as a direct
// dependency, so we read the output type structurally (mirrors learnings/reviews).
export type AIConversationResource = (typeof aiConversationResource)["_output"];
export type AIMessageResource = (typeof aiMessageResource)["_output"];
export type AITaskResource = (typeof aiTaskResource)["_output"];
export type AITaskResultResource = (typeof aiTaskResultResource)["_output"];

// Row → DTO mappers (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change is
// caught once.
export function toConversationDto(row: ConversationRow): AIConversationResource {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId ?? null,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toMessageDto(row: MessageRow): AIMessageResource {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as AIMessageResource["role"],
    content: row.content,
    attachments: (row.attachments ?? []) as string[],
    modelMetadata: (row.modelMetadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

export function toResultDto(row: ResultRow): AITaskResultResource {
  return {
    id: row.id,
    aiTaskId: row.aiTaskId,
    resultType: row.resultType,
    artifactId: row.artifactId ?? null,
    knowledgeItemId: row.knowledgeItemId ?? null,
    assetId: row.assetId ?? null,
    resultData: (row.resultData ?? {}) as Record<string, unknown>,
  };
}

export function toTaskDto(row: TaskRow): AITaskResource {
  return {
    id: row.id,
    userId: row.userId,
    projectId: row.projectId ?? null,
    contentOutputId: row.contentOutputId ?? null,
    taskType: row.taskType,
    status: row.status as AITaskResource["status"],
    inputData: (row.inputData ?? {}) as Record<string, unknown>,
    modelKey: row.modelKey,
    idempotencyKey: row.idempotencyKey,
    requestedAt: row.requestedAt,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    errorMessage: row.errorMessage ?? null,
  };
}
