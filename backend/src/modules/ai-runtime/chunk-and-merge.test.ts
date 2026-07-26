import { describe, expect, it, vi } from "vitest";
import {
  chunkOrderedItems,
  chunkTextDeterministically,
  runOrderedChunks,
} from "./chunk-and-merge";

describe("共享 chunk-and-merge 契约", () => {
  it("按固定大小确定性分块，保留原顺序与完整区间", () => {
    const chunks = chunkOrderedItems([1, 2, 3, 4, 5], 2);
    expect(chunks.map((chunk) => chunk.items)).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(chunks.map(({ index, total, start, end }) => ({ index, total, start, end })))
      .toEqual([
        { index: 0, total: 3, start: 0, end: 2 },
        { index: 1, total: 3, start: 2, end: 4 },
        { index: 2, total: 3, start: 4, end: 5 },
      ]);
  });

  it("长文优先在自然边界切分，拼回后不丢字、不重叠", () => {
    const text = "甲".repeat(18) + "。\n" + "乙".repeat(18) + "。\n" + "丙".repeat(18);
    const chunks = chunkTextDeterministically(text, 25);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 25)).toBe(true);
    expect(chunks.map((chunk) => chunk.text).join("")).toBe(text);
    expect(chunks.at(-1)?.end).toBe(text.length);
  });

  it("严格串行执行并报告进度；显式 fallback 不会打乱结果顺序", async () => {
    const active: number[] = [];
    const progress = vi.fn();
    const result = await runOrderedChunks({
      chunks: chunkOrderedItems(["a", "b", "c"], 1),
      process: async (chunk) => {
        active.push(chunk.index);
        if (chunk.index === 1) throw new Error("第二块失败");
        return chunk.items[0]!.toUpperCase();
      },
      onChunkError: async (error, chunk) => {
        expect(error).toBeInstanceOf(Error);
        return `fallback-${chunk.items[0]}`;
      },
      onProgress: progress,
    });
    expect(active).toEqual([0, 1, 2]);
    expect(result).toEqual(["A", "fallback-b", "C"]);
    expect(progress.mock.calls.map(([event]) => event.status)).toEqual([
      "processing",
      "completed",
      "processing",
      "fallback",
      "processing",
      "completed",
    ]);
  });
});
