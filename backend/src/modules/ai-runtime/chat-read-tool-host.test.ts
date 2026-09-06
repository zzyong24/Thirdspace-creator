import { it, expect, vi } from "vitest";
import { jsonSchema, type ToolSet } from "ai";
import { chatToolApprovalReceiptSchema, agenticToolOutcomeSchema } from "@creatoros/contract/execution-worker";
import { defineChatTool } from "./chat-tool-gate";
import { createChatReadToolHost } from "./chat-read-tool-host";
const ctx = { userId: "u", accountId: "a", requestId: "r", source: "user" as const };
const execution = { executionTaskId: "task", attempt: 1, fenceToken: "fence" };
const scope = { execution, aiTaskId: "ai", callId: "call", toolCallId: "tool", signal: new AbortController().signal };
const params = jsonSchema<{ q?: string }>({ type: "object", properties: { q: { type: "string" } }, additionalProperties: false });
const make = (execute = async () => ({ kind: "context.projects", items: [] as unknown[] }), extra = {}) => defineChatTool("context.projects", { description: "读取", inputSchema: params, execute, ...extra });

it("每次使用真实ctx重建，不执行原型闭包，保留原始卡片与内容", async () => {
  const prototype = vi.fn(async () => ({ kind: "context.projects", items: [] }));
  const run = vi.fn(async () => ({ kind: "context.projects", items: [{ id: "real", title: "正文" }] }));
  const resolve = vi.fn(async () => ({ "context.projects": make(run) }));
  const host = (await createChatReadToolHost({ "context.projects": make(prototype) }, resolve))["context.projects"]!;
  expect(await host.approve(ctx, {}, { execution, modelCallId: "m", toolCallId: "t" })).toEqual({ status: "not-applicable" });
  const result = await host.execute!(ctx, { q: "问" }, scope);
  expect(agenticToolOutcomeSchema.parse(result)).toMatchObject({ status: "ok", sideEffect: "none", data: { items: [{ id: "real", title: "正文" }] } });
  expect(prototype).not.toHaveBeenCalled();
  expect(resolve).toHaveBeenLastCalledWith(ctx, execution, scope.signal);
  expect(run).toHaveBeenCalledExactlyOnceWith({ q: "问" }, { abortSignal: scope.signal });
});
it("none但包含搜索的工具不能伪装宿主短读取", async () => {
  const tool = defineChatTool("material.gather", { description: "搜索", inputSchema: params, execute: async () => ({ kind: "material.gather" }) });
  await expect(createChatReadToolHost({ "material.gather": tool }, async () => ({}))).rejects.toThrow();
});
it("定义变化、工具移除和授权失败都拒绝，授权回执符合严格契约", async () => {
  const run = vi.fn(async () => ({ kind: "context.projects", items: [] }));
  const variants: ToolSet[] = [{}, { "context.projects": make(run, { description: "已改变" }) }, { "context.projects": make(run, { needsApproval: () => { throw Error("暂不可用"); } }) }];
  for (const current of variants) {
    const host = (await createChatReadToolHost({ "context.projects": make() }, async () => current))["context.projects"]!;
    const decision = await host.approve(ctx, {}, { execution, modelCallId: "m", toolCallId: "t" });
    expect(chatToolApprovalReceiptSchema.parse(decision)).toEqual({ status: "unavailable" });
    expect((await host.execute!(ctx, {}, scope)).status).not.toBe("ok");
  }
  expect(run).not.toHaveBeenCalled();
});
it("读取瞬断是明确无副作用失败，不抛成结果未知，也不自动执行第二次", async () => {
  const run = vi.fn(async () => { throw Object.assign(new Error("network unavailable"), { statusCode: 503 }); });
  const host = (await createChatReadToolHost({ "context.projects": make() }, async () => ({ "context.projects": make(run) })))["context.projects"]!;
  expect(await host.execute!(ctx, {}, scope)).toMatchObject({ status: "error", sideEffect: "none", error: { code: "transient", retryable: true }, data: {kind: "context.projects", items: [], error: expect.any(String)} });
  expect(run).toHaveBeenCalledTimes(1);
});
it("取消和非法参数不执行，业务错误信封不当成功空结果", async () => {
  const run = vi.fn(async () => ({ kind: "context.projects", items: [], error: "明确失败" }));
  const host = (await createChatReadToolHost({ "context.projects": make() }, async () => ({ "context.projects": make(run) })))["context.projects"]!;
  expect((await host.execute!(ctx, { q: 42 }, scope)).error?.code).toBe("invalid_input");
  expect((await host.execute!(ctx, {}, { ...scope, signal: AbortSignal.abort() })).error?.code).toBe("cancelled");
  expect(run).not.toHaveBeenCalled();
  expect(await host.execute!(ctx, {}, scope)).toMatchObject({ status: "error", data: { error: "明确失败" }, sideEffect: "none" });
});
