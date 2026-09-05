import { describe, it, expect } from "vitest";
import { workerPortInputSchemas } from "../src/internal/execution-worker";
import { browserActionPreparationSchema } from "../src/internal/execution-browser";
describe("浏览器动作私有端口", () => {
  it("只接受真实账本callId，拒绝自报身份和权限", () => {
    expect(
      workerPortInputSchemas.prepareBrowserAction.parse({ callId: "call" }),
    ).toEqual({ callId: "call" });
    for (const extra of [
      { userId: "other" },
      { url: "https://example.com" },
      { authorization: { allowInteraction: true } },
      { sessionId: "other" },
    ])
      expect(() =>
        workerPortInputSchemas.prepareBrowserAction.parse({
          callId: "call",
          ...extra,
        }),
      ).toThrow();
  });
  it("ready必须包含宿主冻结的完整授权与输入", () => {
    const ready = {
      status: "ready",
      input: { sessionId: "s", url: "https://example.com/" },
      url: "https://example.com/",
      authorization: {
        source: "user_task",
        allowedDomains: ["example.com"],
        allowInteraction: false,
      },
    };
    expect(browserActionPreparationSchema.parse(ready)).toEqual(ready);
    expect(() =>
      browserActionPreparationSchema.parse({
        ...ready,
        authorization: { allowInteraction: true },
      }),
    ).toThrow();
  });
  it("拒绝状态只返回规范工具结果，不能夹带凭据", () => {
    const blocked = {
      status: "blocked",
      outcome: {
        status: "blocked",
        summary: "未授权",
        evidence: [],
        error: {
          code: "permission",
          retryable: false,
          recovery: "明确网站范围",
        },
        continuation: null,
        sideEffect: "none",
      },
    };
    expect(browserActionPreparationSchema.parse(blocked)).toEqual(blocked);
    expect(() =>
      browserActionPreparationSchema.parse({ ...blocked, cookies: [] }),
    ).toThrow();
  });
});
it("浏览器证据结算只接callId和规范回执，不接自报归属", () => {
  const output = {
    status: "ok",
    summary: "已观察",
    evidence: [],
    error: null,
    continuation: null,
    sideEffect: "none",
  };
  expect(
    workerPortInputSchemas.settleBrowserObservation.parse({
      callId: "call",
      output,
    }),
  ).toEqual({ callId: "call", output });
  expect(() =>
    workerPortInputSchemas.settleBrowserObservation.parse({
      callId: "call",
      output,
      userId: "other",
    }),
  ).toThrow();
  expect(() =>
    workerPortInputSchemas.settleBrowserObservation.parse({
      callId: "call",
      output: { ...output, sideEffect: "fake" },
    }),
  ).toThrow();
});
