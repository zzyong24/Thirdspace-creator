import { z } from "zod";

/** 私有父子进程协议；用户身份由后端任务记录恢复，不在 Worker 消息中指定。 */
export const executionRefSchema = z.object({
  executionTaskId: z.string().min(1),
  attempt: z.number().int().positive(),
  fenceToken: z.string().min(1),
}).strict();
export type ExecutionRef = z.infer<typeof executionRefSchema>;
export const workerPortSchema = z.enum([
  "readTaskContext", "resolveModelCredential", "reserveCall", "settleCall",
  "saveCheckpoint", "commitResult", "heartbeat", "acknowledgeControl",
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
/** 每个命名端口都有单独的载荷边界；身份字段不得从 Worker 注入。 */
export const workerPortInputSchemas = {
  readTaskContext: emptyPortInput,
  resolveModelCredential: z.object({capability: z.string().min(1).max(128)}).strict(),
  reserveCall: z.object({operationKey: operationKeySchema, maxOutputTokens: z.number().int().positive().max(65536)}).strict(),
  settleCall: z.discriminatedUnion("status", [
    z.object({operationKey: operationKeySchema, status: z.literal("settled"), usage: workerUsageSchema}).strict(),
    z.object({operationKey: operationKeySchema, status: z.enum(["unknown", "rejected"])}).strict(),
  ]),
  saveCheckpoint: z.object({expectedRevision: z.number().int().nonnegative(), checkpoint: z.record(z.string(), z.unknown())}).strict(),
  commitResult: z.discriminatedUnion("outcome", [
    z.object({outcome: z.literal("succeeded"), text: z.string().min(1).max(2_000_000)}).strict(),
    z.object({outcome: z.enum(["failed", "unknown_result", "retry_wait", "waiting_user"]), errorCode: z.string().min(1).max(128), retryAfterMs: z.number().finite().nonnegative().optional()}).strict(),
  ]),
  heartbeat: emptyPortInput,
  acknowledgeControl: emptyPortInput,
} satisfies Record<WorkerPort, z.ZodType>;
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
  baseUrl: z.string().nullable(), model: z.string().min(1), token: z.string().min(1),
  displayModelKey: z.literal("channel-managed").optional(),
  structuredOutputs: z.boolean().optional(),
});
export function sameExecution(a: ExecutionRef, b: ExecutionRef): boolean {
  return a.executionTaskId === b.executionTaskId && a.attempt === b.attempt && a.fenceToken === b.fenceToken;
}
