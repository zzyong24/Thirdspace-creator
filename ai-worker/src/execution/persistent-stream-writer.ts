import { z } from "zod";
import {
  executionStreamChunkSchema,
  appendExecutionStreamSchema,
} from "@creatoros/contract/execution-worker";
type Chunk = z.infer<typeof executionStreamChunkSchema>;
type Batch = z.infer<typeof appendExecutionStreamSchema>;
/** 短窗口合并文本，单路IPC背压；未知保存结果不能换索引重放。 */
export function createPersistentStreamWriter(
  callId: string,
  append: (batch: Batch) => Promise<unknown>,
  options: { flushMs?: number } = {},
) {
  let chunks: Chunk[] = [],
    bytes = 0,
    index = 0,
    closed = false,
    error: unknown,
    timer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();
  const receipt = z.object({
    nextIndex: z.number().int().nonnegative(),
    lastSequence: z.number().int().positive(),
  });
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const flush = (): Promise<void> => {
    clear();
    if (error) return Promise.reject(error);
    if (!chunks.length) return pending;
    const batch = chunks;
    chunks = [];
    bytes = 0;
    const operation = pending.then(async () => {
      if (error) throw error;
      const data = appendExecutionStreamSchema.parse({
        callId,
        startIndex: index,
        chunks: batch,
      });
      const saved = receipt.parse(await append(data));
      if (saved.nextIndex !== index + batch.length)
        throw Error("STREAM_RECEIPT_MISMATCH");
      index = saved.nextIndex;
    });
    pending = operation.catch((failure) => {
      error = failure;
      throw failure;
    });
    // 定时写入出错在下一次push/close传播；这里仅避免无人等待时出现unhandled rejection。
    void pending.catch(() => {});
    return pending;
  };
  return {
    async push(raw: unknown) {
      if (closed) throw Error("STREAM_WRITER_CLOSED");
      if (error) throw error;
      const chunk = executionStreamChunkSchema.parse(raw),
        last = chunks.at(-1);
      if (
        chunk.type === "text-delta" &&
        last?.type === "text-delta" &&
        last.id === chunk.id &&
        typeof last.delta === "string" &&
        typeof chunk.delta === "string"
      )
        last.delta += chunk.delta;
      else chunks.push(chunk);
      bytes += JSON.stringify(chunk).length;
      if (chunks.length >= 128 || bytes >= 8192) await flush();
      else if (!timer)
        timer = setTimeout(() => {
          void flush().catch(() => {});
        }, options.flushMs ?? 40);
    },
    flush,
    async close() {
      closed = true;
      clear();
      await flush();
      if (error) throw error;
    },
  };
}
