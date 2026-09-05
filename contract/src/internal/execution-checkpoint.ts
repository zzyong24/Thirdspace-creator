import { z } from "zod";

const id = z.string().min(1).max(256);
/** 消息正文只从后端调用回执重建；Worker 不能自报预算、身份或浏览器句柄。 */
export const checkpointMessageRefSchema = z.object({
  role: z.enum(["assistant", "tool"]),
  callId: id,
}).strict();
export const saveExecutionCheckpointSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  expectedLedgerSequence: z.number().int().nonnegative(),
  messages: z.array(checkpointMessageRefSchema).max(10000),
}).strict();
export const executionCheckpointSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  expectedRevision: z.number().int().nonnegative(),
  requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  ledgerSequence: z.number().int().nonnegative(),
  messages: z.array(checkpointMessageRefSchema).max(10000),
}).strict();
/** 工具回执规范格式；稳定 toolCallId 由已结算模型响应提供。 */
export const workerToolResultReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("tool"),
  toolCallId: id,
  toolName: id,
  output: z.json(),
}).strict().refine(value => JSON.stringify(value).length <= 2_000_000, "工具回执过大");
export const checkpointToolCallSchema = z.object({
  type: z.literal("tool-call"),
  toolCallId: id,
  toolName: id,
  input: z.string().max(1_000_000),
}).passthrough();
