import { it, expect } from "vitest";
import {
  topicReadPortInputSchemas,
  topicReadReceiptSchema,
  topicReadStoredReceiptSchema,
} from "../src/internal/execution-topic-read";
import {
  workerPortSchema,
  workerPortInputSchemas,
} from "../src/internal/execution-worker";
it("热点端口仅允许冻结目标和两次ordinal，拒绝Worker自报query/url/归属", () => {
  for (const name of Object.keys(topicReadPortInputSchemas))
    expect(workerPortSchema.parse(name)).toBe(name);
  expect(
    workerPortInputSchemas.reserveTopicRead.parse({
      target: { kind: "search" },
    }),
  ).toEqual({ target: { kind: "search" }, ordinal: 1 });
  for (const raw of [
    { target: { kind: "search", query: "forged" } },
    { target: { kind: "source", sourceId: "a" }, url: "https://evil.com" },
    { target: { kind: "search" }, ordinal: 3 },
    { target: { kind: "search" }, userId: "other" },
  ])
    expect(() => workerPortInputSchemas.reserveTopicRead.parse(raw)).toThrow();
});
it("独立topic receipt不接受Agent绑定、凭据或任意证据ID，URL仅HTTP无凭据", () => {
  const receipt = {
    kind: "web",
    status: "ok",
    data: { sourceUrl: "https://example.com", title: "标题", text: "正文" },
  };
  expect(topicReadReceiptSchema.parse(receipt)).toEqual(receipt);
  for (const data of [
    { ...receipt.data, evidenceRef: "forged" },
    { ...receipt.data, sourceUrl: "file:///tmp/a" },
    { ...receipt.data, sourceUrl: "https://user:pass@example.com" },
  ])
    expect(() => topicReadReceiptSchema.parse({ ...receipt, data })).toThrow();
  expect(() =>
    topicReadStoredReceiptSchema.parse({
      protocol: "topic.read.v1",
      target: { kind: "source", sourceId: "a" },
      request: {
        kind: "web",
        sourceId: "a",
        name: "来源",
        domain: "example.com",
        url: "https://example.com",
      },
      requestDigest: "sha256:" + "a".repeat(64),
      receipt,
      toolCallId: "forged",
    }),
  ).toThrow();
  expect(() =>
    topicReadReceiptSchema.parse({
      kind: "web",
      status: "error",
      error: { code: "needs_login", retryable: false },
    }),
  ).toThrow();
});
