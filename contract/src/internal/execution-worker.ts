export { chatWorkerInputSchema, chatToolProviderName } from "./chat-worker";
import {appendExecutionStreamSchema} from "./execution-stream";
export {appendExecutionStreamSchema,readExecutionStreamSchema,executionStreamChunkSchema} from "./execution-stream";
import {topicReadPortInputSchemas} from "./execution-topic-read";
import { agenticWorkerInputSchema, reserveAgenticModelSchema } from "./agentic-worker";
export { agenticWorkerInputSchema, reserveAgenticModelSchema, agenticCommitReceiptSchema } from "./agentic-worker";
import { reserveAgenticToolSchema, settleAgenticToolSchema, agenticToolOutcomeSchema } from "./agentic-tool-call";
export { reserveAgenticToolSchema, settleAgenticToolSchema, agenticToolReservationSchema, agenticToolOutcomeSchema, type AgenticToolOutcome } from "./agentic-tool-call";
import { saveExecutionCheckpointSchema } from "./execution-checkpoint";
export { saveExecutionCheckpointSchema, executionCheckpointSchema, checkpointToolCallSchema, workerToolResultReceiptSchema } from "./execution-checkpoint";
import { z } from "zod";

/** 私有父子进程协议；用户身份由后端任务记录恢复，不在 Worker 消息中指定。 */
export const executionRefSchema = z.object({
  executionTaskId: z.string().min(1),
  attempt: z.number().int().positive(),
  fenceToken: z.string().min(1),
}).strict();
export type ExecutionRef = z.infer<typeof executionRefSchema>;
export const workerPortSchema = z.enum([
  "appendStreamEvents",
  "completeDailyTopicSkip", "commitDailyTopicResult",
  "reserveTopicRead", "startTopicRead", "settleTopicRead", "readTopicRead", "readTopicBrowserSession", "saveTopicBrowserSession",
  "readTaskContext", "resolveModelCredential", "reserveCall", "startCall", "settleCall",
  "prepareScriptImport", "saveScriptFallback", "saveScriptVoiceover",
  "settleBrowserObservation", "prepareBrowserAction", "readBrowserSession", "saveBrowserSession", "settleResearchRead", "executeEvidenceRead", "reserveAgenticModel", "executeAgenticTool", "commitAgenticResult", "reserveAgenticTool", "startAgenticTool", "settleAgenticTool", "reserveGenerationCall", "settleGenerationCall", "saveGenerationResult", "readCheckpoint", "saveCheckpoint", "commitResult", "heartbeat", "acknowledgeControl",
]);
export type WorkerPort = z.infer<typeof workerPortSchema>;
const emptyPortInput = z.object({}).strict();
const operationKeySchema = z.string().min(1).max(256);
const tokenCountSchema = z.number().int().nonnegative().optional();
export const workerUsageSchema = z.object({
  inputTokens: tokenCountSchema, outputTokens: tokenCountSchema, totalTokens: tokenCountSchema,
  inputTokenDetails: z.object({noCacheTokens: tokenCountSchema, cacheReadTokens: tokenCountSchema, cacheWriteTokens: tokenCountSchema}).optional(),
  outputTokenDetails: z.object({textTokens: tokenCountSchema, reasoningTokens: tokenCountSchema}).optional(),
});
/** 仅保存可恢复的模型结果，不保留请求正文、HTTP头或原始响应日志。 */
export const workerProviderReceiptSchema = z.object({
  content: z.array(z.json()),
  stream: z.object({schemaVersion:z.literal(1),parts:z.array(z.json())}).strict().optional(),
  finishReason: z.object({unified:z.string(),raw:z.string().optional()}).strict(),
  usage: z.object({
    inputTokens:z.object({total:tokenCountSchema,noCache:tokenCountSchema,cacheRead:tokenCountSchema,cacheWrite:tokenCountSchema}),
    outputTokens:z.object({total:tokenCountSchema,text:tokenCountSchema,reasoning:tokenCountSchema}),
  }),
  warnings:z.array(z.json()),
  providerMetadata:z.record(z.string(),z.json()).optional(),
}).strict().refine(value=>JSON.stringify(value).length<=4_000_000,"模型回执超过持久化上限");
export type WorkerProviderReceipt = z.infer<typeof workerProviderReceiptSchema>;

/** 每个命名端口都有单独的载荷边界；身份字段不得从 Worker 注入。 */
export const workerPortInputSchemas = {
  appendStreamEvents:appendExecutionStreamSchema,
  completeDailyTopicSkip: emptyPortInput,
  commitDailyTopicResult: z.object({outcome:z.literal("succeeded"),callId:operationKeySchema,text:z.string().min(1).max(2_000_000)}).strict(),
  ...topicReadPortInputSchemas,
  readTaskContext: emptyPortInput,
  prepareScriptImport: emptyPortInput,
  saveScriptFallback: z.object({text:z.string().min(1).max(2_000_000)}).strict(),
  saveScriptVoiceover: z.object({callId:operationKeySchema,voiceover:z.string().min(1).max(200000),centralClaim:z.string(),audienceOldBelief:z.string(),generation:z.json()}).strict(),
  readBrowserSession:z.object({callId:operationKeySchema}).strict(),
  prepareBrowserAction:z.object({callId:operationKeySchema}).strict(),
  settleBrowserObservation:z.object({callId:operationKeySchema,output:agenticToolOutcomeSchema}).strict(),
  saveBrowserSession:z.object({callId:operationKeySchema,revision:z.string().min(1).nullable(),stateJson:z.string().max(2_100_000)}).strict(),
  settleResearchRead:z.object({callId:operationKeySchema,observation:z.object({sourceUrl:z.string().url().max(8192),title:z.string().max(10000),fullText:z.string().max(8_000_000),needLogin:z.boolean().optional()}).strict()}).strict(),
  executeEvidenceRead:z.object({callId:operationKeySchema}).strict(),
  reserveAgenticModel: reserveAgenticModelSchema,
  executeAgenticTool:z.object({callId:operationKeySchema}).strict(),
  commitAgenticResult:z.object({actualEngine:z.literal("pi"),summary:z.string().max(10000),stopReason:z.enum(["completed","max_steps","budget_exhausted","aborted","llm_error"]),lastModelCallId:operationKeySchema,toolCallIds:z.array(operationKeySchema).max(10000)}).strict(),
  reserveAgenticTool: reserveAgenticToolSchema,
  settleAgenticTool: settleAgenticToolSchema,
  resolveModelCredential: z.object({capability: z.string().min(1).max(128)}).strict(),
  reserveCall: z.object({operationKey: operationKeySchema, maxOutputTokens: z.number().int().positive().max(65536)}).strict(),
  reserveGenerationCall: z.object({operationKey:operationKeySchema,request:z.record(z.string(),z.json()).refine(value=>JSON.stringify(value).length<=4_000_000)}).strict(),
  settleGenerationCall: z.discriminatedUnion("status", [
    z.object({callId:operationKeySchema,status:z.literal("settled"),providerResult:workerProviderReceiptSchema,usage:workerUsageSchema}).strict(),
    z.object({callId:operationKeySchema,status:z.literal("rejected"),rejectionCode:z.literal("STRUCTURED_PROTOCOL_UNSUPPORTED").optional()}).strict(),
    z.object({callId:operationKeySchema,status:z.literal("unknown")}).strict(),
  ]),
  saveGenerationResult:z.object({callId:operationKeySchema,text:z.string().min(1).max(2_000_000)}).strict(),
  startAgenticTool: z.object({callId: operationKeySchema}).strict(),
  startCall: z.object({callId: operationKeySchema}).strict(),
  settleCall: z.discriminatedUnion("status", [
    z.object({callId: operationKeySchema, status: z.literal("settled"), usage: workerUsageSchema, text: z.string().min(1).max(2_000_000)}).strict(),
    z.object({callId: operationKeySchema, status: z.enum(["unknown", "rejected"])}).strict(),
  ]),
  readCheckpoint: emptyPortInput,
  saveCheckpoint: saveExecutionCheckpointSchema,
  commitResult: z.discriminatedUnion("outcome", [
    z.object({outcome: z.literal("succeeded"), callId: operationKeySchema, text: z.string().min(1).max(2_000_000)}).strict(),
    z.object({outcome: z.enum(["failed", "unknown_result", "retry_wait", "waiting_user"]), errorCode: z.string().min(1).max(128), retryAfterMs: z.number().finite().nonnegative().optional()}).strict(),
  ]),
  heartbeat: emptyPortInput,
  acknowledgeControl: emptyPortInput,
} satisfies Record<WorkerPort, z.ZodType>;
export const workerReservationSchema = z.object({
  callId: operationKeySchema,
  status: z.enum(["reserved", "started", "settled", "unknown", "rejected"]),
  providerResult:workerProviderReceiptSchema.optional(),
  rejectionCode:z.literal("STRUCTURED_PROTOCOL_UNSUPPORTED").optional(),
  resultText: z.string().min(1).max(2_000_000).optional(),
}).strict();
export const workerStartReceiptSchema = z.object({callId: operationKeySchema, status: z.literal("started")}).strict();
const envelope = { version: z.literal(1), requestId: z.string().min(1) };
export const workerStopReasonSchema = z.enum(["completed", "cancelled", "failed", "unknown_result", "retry_wait", "waiting_user"]);
export type WorkerStopReason = z.infer<typeof workerStopReasonSchema>;
export const hostMessageSchema = z.discriminatedUnion("type", [
  z.object({...envelope, type: z.literal("run"), execution: executionRefSchema, deadlineAt: z.number().finite()}),
  z.object({...envelope, type: z.literal("cancel"), execution: executionRefSchema}),
  z.object({...envelope, type: z.literal("reply"), ok: z.boolean(), data: z.unknown().optional(), errorCode: z.string().optional()}),
]);
export type HostMessage = z.infer<typeof hostMessageSchema>;
export const workerMessageSchema = z.discriminatedUnion("type", [
  z.object({...envelope, type: z.literal("ready"), capabilities: z.array(z.string())}),
  z.object({...envelope, type: z.literal("call"), execution: executionRefSchema, port: workerPortSchema, data: z.unknown()}),
  z.object({...envelope, type: z.literal("progress"), execution: executionRefSchema, seq: z.number().int().nonnegative(), text: z.string()}),
  z.object({...envelope, type: z.literal("stopped"), execution: executionRefSchema, reason: workerStopReasonSchema}),
]);
export type WorkerMessage = z.infer<typeof workerMessageSchema>;
export const modelGenerationInputSchema = z.object({
  kind: z.literal("model.generate"),
  operationKey: z.string().min(1),
  prompt: z.string().min(1),
  system: z.string().optional(),
  capability: z.string().min(1),
  maxOutputTokens: z.number().int().positive().max(65536),
});
export const workerModelSpecSchema = z.object({
  apiFormat: z.enum(["anthropic", "openai_chat", "openai_responses"]),
  authStyle: z.enum(["bearer", "x-api-key"]).optional(),
  baseUrl: z.string().nullable(), model: z.string().min(1), token: z.string().min(1),
  displayModelKey: z.literal("channel-managed").optional(),
  structuredOutputs: z.boolean().optional(),
});
export function sameExecution(a: ExecutionRef, b: ExecutionRef): boolean {
  return a.executionTaskId === b.executionTaskId && a.attempt === b.attempt && a.fenceToken === b.fenceToken;
}

const completionPolicySchema=z.object({schemaVersion:z.literal(1),minSegments:z.number().int().nonnegative(),maxSegments:z.number().int().positive().nullable(),requiredSequence:z.array(z.string()),repairAttempts:z.number().int().nonnegative()}).strict();
export const workerSkillSnapshotSchema=z.object({
  snapshotVersion:z.literal(1),userId:z.string().min(1),accountId:z.string().min(1),resolvedAt:z.string().min(1),platformPolicyVersion:z.string().min(1),platformPolicy:z.string().min(1),
  skills:z.array(z.object({skillId:z.string().min(1),baseVersion:z.string().min(1),overlayRevision:z.number().int().nonnegative().nullable(),overlayVersion:z.string().nullable(),effective:z.object({
    methodSystem:z.string(),template:z.string(),tools:z.array(z.string()),requiredFacets:z.array(z.string()),contextRequirements:z.array(z.string()),outputSchema:z.record(z.string(),z.json()).nullable(),completionPolicy:completionPolicySchema.nullable(),completionPolicyAdapter:z.object({id:z.string().min(1),version:z.string().min(1)}).strict().nullable(),
  }).strict()}).strict()).min(1),
}).strict();
export const structuredGenerationInputSchema=z.object({
  kind:z.literal("model.structured"),operationKey:z.string().min(1).max(200),capability:z.string().min(1),maxOutputTokens:z.number().int().positive().max(65536),
  skillId:z.string().min(1),skillSnapshot:workerSkillSnapshotSchema,facets:z.record(z.string(),z.string()),timeoutMs:z.number().int().positive().optional(),
}).strict().refine(value=>value.skillSnapshot.skills.some(skill=>skill.skillId===value.skillId && skill.effective.outputSchema!==null),"结构化任务缺少冻结输出契约");
export const workerTaskInputSchema=z.union([modelGenerationInputSchema,structuredGenerationInputSchema,agenticWorkerInputSchema]);
const structuredUsageSchema=z.object({inputTokens:z.number().nonnegative().nullable(),outputTokens:z.number().nonnegative().nullable(),cachedTokens:z.number().nonnegative().nullable(),totalTokens:z.number().nonnegative().nullable()});
const completionViolationSchema=z.object({code:z.string(),path:z.string(),message:z.string()});
export const workerStructuredResultSchema=z.object({
  object:z.json(),
  modelLabel:z.string().min(1).optional(),
  generation:z.object({finishReason:z.string(),usage:structuredUsageSchema,attempts:z.array(z.object({finishReason:z.string(),usage:structuredUsageSchema,kind:z.enum(["initial","repair"])}))}),
  validation:z.object({status:z.enum(["valid","partial"]),errors:z.array(completionViolationSchema),policySnapshot:z.object({policy:completionPolicySchema,adapter:z.object({id:z.string(),version:z.string()})}),originalSegmentCount:z.number().int().nonnegative(),finalSegmentCount:z.number().int().nonnegative(),repairAttemptsUsed:z.number().int().nonnegative(),repairReasons:z.array(completionViolationSchema)}).optional(),
}).strict();
export type WorkerStructuredResult=z.infer<typeof workerStructuredResultSchema>;

export {browserActionPreparationSchema,browserAuthorizationSnapshotSchema,type BrowserAuthorizationSnapshot,browserObserveInputSchema,browserActInputSchema,browserObservationSchema,type BrowserObserveInput,type BrowserActInput,type BrowserObservation} from "./execution-browser";

export {topicReadTargetSchema,topicReadRequestSchema,topicReadReceiptSchema,topicReadStoredReceiptSchema,topicReadReservationSchema,topicReadErrorCodeSchema,type TopicReadTarget,type TopicReadRequest,type TopicReadReceipt} from "./execution-topic-read";
