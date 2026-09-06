import { z } from "zod";
/** 私有展示事件：只恢复流内容，不能据此改变执行终态或采纳领域数据。 */
export const executionStreamChunkSchema = z
  .object({ type: z.string().min(1).max(128) })
  .catchall(z.json());
export const appendExecutionStreamSchema = z
  .object({
    callId: z.string().min(1).max(256),
    startIndex: z.number().int().nonnegative(),
    chunks: z.array(executionStreamChunkSchema).min(1).max(128),
  })
  .strict()
  .refine(
    (v) => JSON.stringify(v).length <= 2_000_000,
    "流事件批次超过传输上限",
  );
export const readExecutionStreamSchema = z
  .object({
    afterSequence: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(128).default(64),
  })
  .strict();
