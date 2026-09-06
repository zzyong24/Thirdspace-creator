import { it, expect, vi } from "vitest";
import { createPersistentStreamWriter } from "./persistent-stream-writer";
it("相邻文本合并、按顺序批量持久化并验证回执；关闭不遗留尾部", async () => {
  const writes: any[] = [];
  const writer = createPersistentStreamWriter("call", async (data) => {
    writes.push(data);
    return {
      nextIndex: data.startIndex + data.chunks.length,
      lastSequence: data.startIndex + data.chunks.length,
    };
  });
  await writer.push({ type: "text-delta", id: "t", delta: "甲" });
  await writer.push({ type: "text-delta", id: "t", delta: "乙" });
  await writer.push({
    type: "tool-input-start",
    toolCallId: "tool",
    toolName: "read",
  });
  await writer.close();
  expect(writes).toEqual([
    {
      callId: "call",
      startIndex: 0,
      chunks: [
        { type: "text-delta", id: "t", delta: "甲乙" },
        { type: "tool-input-start", toolCallId: "tool", toolName: "read" },
      ],
    },
  ]);
  await expect(writer.push({ type: "finish" })).rejects.toThrow();
});
it("慢宿主下flush串行且索引连续，定时flush失败必须传回生成层", async () => {
  const writes: any[] = [];
  let release: () => void = () => {};
  const writer = createPersistentStreamWriter("call", async (data) => {
    writes.push(data);
    if (writes.length === 1) await new Promise<void>((r) => (release = r));
    return {
      nextIndex: data.startIndex + data.chunks.length,
      lastSequence: writes.length,
    };
  });
  await writer.push({ type: "text-delta", id: "t", delta: "甲" });
  const first = writer.flush();
  await Promise.resolve();
  await writer.push({ type: "text-delta", id: "t", delta: "乙" });
  const second = writer.flush();
  release();
  await Promise.all([first, second]);
  await writer.close();
  expect(writes.map((w) => w.startIndex)).toEqual([0, 1]);
  const bad = createPersistentStreamWriter(
    "call",
    async () => {
      throw Error("host disconnected");
    },
    { flushMs: 1 },
  );
  await bad.push({ type: "text-delta", id: "t", delta: "已输出" });
  await new Promise((r) => setTimeout(r, 10));
  await expect(bad.close()).rejects.toThrow("host disconnected");
});
it("宿主错误回执不当作保存成功，不换索引重放未知批次", async () => {
  const append = vi.fn(async () => ({ nextIndex: 999, lastSequence: 1 })),
    writer = createPersistentStreamWriter("call", append);
  await writer.push({ type: "text-delta", id: "t", delta: "正文" });
  await expect(writer.close()).rejects.toThrow("STREAM_RECEIPT_MISMATCH");
  expect(append).toHaveBeenCalledTimes(1);
});
