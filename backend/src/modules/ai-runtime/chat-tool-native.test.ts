import { describe, expect, it, vi } from "vitest";
import { jsonSchema, tool } from "ai";
import { defineChatTool, getChatToolNativeExecutor } from "./chat-tool-gate";

const inputSchema = jsonSchema<{ q?: string }>({ type: "object", properties: { q: { type: "string" } } });

describe("真实工具执行入口", () => {
  it("原样抛出异常且只执行一次；旧错误卡片仍兼容", async () => {
    const failure = new Error("响应未知");
    const execute = vi.fn(async () => { throw failure; });
    const humanize = vi.fn(() => ({ message: "暂时失败", suggestSwitchModel: false }));
    const built = defineChatTool("topic.generate", { description: "d", inputSchema, execute }, humanize);
    await expect(getChatToolNativeExecutor(built)!({})).rejects.toBe(failure);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(humanize).not.toHaveBeenCalled();
    await expect((built.execute as Function)({}, {})).resolves.toEqual({ kind: "topic.candidates", items: [], error: "暂时失败" });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("透传参数和执行上下文，共用结果预算且保留真实 ID", async () => {
    const execute = vi.fn(async () => ({ kind: "topic.candidates", taskId: "real-task", text: "文".repeat(100_000) }));
    const built = defineChatTool("topic.generate", { description: "d", inputSchema, execute });
    const input = { q: "实际输入" };
    const options = { signal: new AbortController().signal };
    const result = await getChatToolNativeExecutor(built)!(input, options) as Record<string, unknown>;
    expect(execute).toHaveBeenCalledExactlyOnceWith(input, options);
    expect(result.taskId).toBe("real-task");
    expect((result.text as string).length).toBeLessThan(100_000);
  });

  it("不把非 Error 异常改造成成功结果，也不擅自分类返回信封", async () => {
    const failure = { code: "unknown_commit" };
    const built = defineChatTool("topic.generate", { description: "d", inputSchema, execute: () => { throw failure; } });
    await expect(getChatToolNativeExecutor(built)!({})).rejects.toBe(failure);
    const envelope = { kind: "topic.candidates", error: "业务显式失败", items: [] };
    const returned = defineChatTool("topic.generate", { description: "d", inputSchema, execute: () => envelope });
    await expect(getChatToolNativeExecutor(returned)!({})).resolves.toEqual(envelope);
  });

  it("未登记工具不回落到吞异常的 SDK execute", () => {
    expect(getChatToolNativeExecutor(tool({ description: "external", inputSchema }))).toBeUndefined();
  });
});
