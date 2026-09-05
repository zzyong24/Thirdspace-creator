import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createLoopController } from "./loop-control";
import { __setPiSdkForTest, createPiAgenticEngine, toPiCustomTool } from "./pi-engine";
import type { AgenticTool } from "./engine";

afterEach(() => __setPiSdkForTest(undefined));

function bridge(signal = new AbortController().signal) {
  const execute = vi.fn(async () => ({ summary: "找到来源", data: { url: "https://example.com/source", fullText: "来源正文证据" } }));
  const tool: AgenticTool = { name: "web.read", label: "阅读", description: "读取来源", effect: "none", parameters: z.object({}), execute };
  return { execute, custom: toPiCustomTool(tool, { signal, decideDryRun: () => false, onStep: async () => {}, toolLog: [], outputs: {} }) as { execute: (id: string, input: unknown) => Promise<{content: Array<{text: string}>}> } };
}

describe("T-915 执行可靠性回归", () => {
  it("工具正文与 URL 进入模型 content，不能只留在 details", async () => {
    const result = await bridge().custom.execute("call-1", {});
    const content = result.content.map(x => x.text).join("\n");
    expect(content).toContain("https://example.com/source");
    expect(content).toContain("来源正文证据");
  });

  it("已取消的工具调用不进入底层端口", async () => {
    const controller = new AbortController(); controller.abort();
    const tool = bridge(controller.signal);
    await expect(tool.custom.execute("late", {})).rejects.toThrow();
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it("检查点已耗尽 token 时，第一步就拒绝", () => {
    const c = createLoopController({maxSteps: 10, maxTokens: 100}, {stepsUsed: 1, tokensUsed: 100});
    expect(c.beginStep()).toBe(false);
    expect(c.terminationReason()).toBe("budget_exhausted");
  });

  it("已停止的 Pi 任务不会因缺 SDK 转而启动 fallback", async () => {
    __setPiSdkForTest(null);
    const run = vi.fn(async () => ({summary: "fallback", output: {}, steps: 0, stopReason: "completed"}));
    const signal = AbortSignal.abort();
    const result = await createPiAgenticEngine({fallback: {name: "deterministic", run}}).run({goal: "读取", systemPrompt: "", tools: [], llm: async () => ({text: "", tokensUsed: 0}), controller: createLoopController({maxSteps: 10, maxTokens: 100}), decideDryRun: () => false, onStep: async () => {}, signal});
    expect(run).not.toHaveBeenCalled();
    expect(result.stopReason).toBe("aborted");
  });
});
