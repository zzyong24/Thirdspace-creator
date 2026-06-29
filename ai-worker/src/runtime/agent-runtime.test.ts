import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { runAgentNode } from "./agent-runtime.js";

// 用 MockLanguageModelV4 跑确定性单测 —— 不用真 API key,证明 runtime 的 generateText
// 接线 + 步骤事件采集 + 结果回传都对。工具多步链路的测试随工具注册表落地后补。
// mock 结果用 @ai-sdk/provider 的真实类型标注,逐字段过 typecheck(非 cast)。

const FINAL: LanguageModelV4GenerateResult = {
  content: [{ type: "text", text: "选题:把 KV cache 压到 1/10 的那段代码" }],
  finishReason: { unified: "stop", raw: undefined },
  usage: {
    inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 9, text: 9, reasoning: undefined },
  },
  warnings: [],
};

describe("runAgentNode", () => {
  it("一次纯生成:回传最终文本 + 至少一个步骤事件 + onStep 被回调", async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => FINAL });

    const seen: number[] = [];
    const res = await runAgentNode({
      model,
      system: "你是选题会 agent。",
      prompt: "按定位出 1 条选题。",
      onStep: (e) => {
        seen.push(e.stepNo);
      },
    });

    expect(res.text).toContain("KV cache");
    expect(res.steps.length).toBeGreaterThanOrEqual(1);
    expect(res.steps[0]?.stepNo).toBe(1);
    expect(seen).toContain(1); // onStep 回调真被调了(步骤日志的命脉)
  });
});
