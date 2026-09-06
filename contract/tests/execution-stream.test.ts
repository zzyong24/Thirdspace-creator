import { it, expect } from "vitest";
import {
  workerPortInputSchemas,
  workerPortSchema,
  readExecutionStreamSchema,
} from "../src/internal/execution-worker";
it("流事件端口不接受Worker注入账号、任务身份或状态，载荷和索引有界", () => {
  const good = {
    callId: "real-call",
    startIndex: 0,
    chunks: [{ type: "text-delta", id: "text", delta: "正文" }],
  };
  expect(workerPortSchema.parse("appendStreamEvents")).toBe(
    "appendStreamEvents",
  );
  expect(workerPortInputSchemas.appendStreamEvents.parse(good)).toEqual(good);
  for (const bad of [
    { ...good, accountId: "foreign" },
    { ...good, status: "succeeded" },
    { ...good, executionTaskId: "foreign" },
    { ...good, startIndex: -1 },
    { ...good, chunks: [] },
    { ...good, chunks: Array(129).fill({ type: "finish" }) },
    { ...good, chunks: [{ type: "text-delta", delta: "x".repeat(2_000_000) }] },
  ])
    expect(
      workerPortInputSchemas.appendStreamEvents.safeParse(bad).success,
    ).toBe(false);
});
it("订阅游标分页只接受只读参数", () => {
  expect(readExecutionStreamSchema.parse({})).toEqual({
    afterSequence: 0,
    limit: 64,
  });
  for (const value of [{ afterSequence: -1 }, { limit: 129 }, { cancel: true }])
    expect(readExecutionStreamSchema.safeParse(value).success).toBe(false);
});
