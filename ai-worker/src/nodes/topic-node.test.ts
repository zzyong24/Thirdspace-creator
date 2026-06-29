import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { runTopicNode, parseTopics } from "./topic-node.js";

function finalText(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
  };
}

const TOPICS_JSON = JSON.stringify([
  {
    title: "复现 DeepSeek MLA:把 KV cache 压到 1/10 的那段代码",
    angle: "不讲原理先跑数,单卡对比 KV cache 占用",
    contentRole: "traffic",
    source: "trend",
    predictedScore: 88,
    reason: "MLA 是 2026 KV 优化终局,人人想省显存",
  },
  {
    title: "Agentic RAG vs 普通 RAG:同一套语料实测准确率差多少",
    angle: "对照实验出数据",
    contentRole: "trust",
    source: "benchmark",
    predictedScore: 82,
    reason: "可量化对比天然有信任感",
  },
]);

describe("runTopicNode", () => {
  it("在 Agent Runtime 上产出可解析选题 + 发步骤事件", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(TOPICS_JSON),
    });
    const steps: number[] = [];
    const res = await runTopicNode({
      model,
      positioningBrief: "AI 工程科普,面向想动手的开发者,差异化=只讲能跑的代码。",
      basis: "trend",
      onStep: (e) => {
        steps.push(e.stepNo);
      },
    });

    expect(res.topics).toHaveLength(2);
    expect(res.topics[0]?.title).toContain("MLA");
    expect(res.topics[0]?.predictedScore).toBe(88);
    expect(res.steps.length).toBeGreaterThanOrEqual(1);
    expect(steps).toContain(1); // 步骤日志真被喂了
  });

  it("agent 无可解析选题时抛错(让任务进终态,不假成功)", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText("抱歉,我无法完成。"),
    });
    await expect(
      runTopicNode({ model, positioningBrief: "x", basis: "positioning" }),
    ).rejects.toThrow(/未产出可解析选题/);
  });

  it("parseTopics 容忍 ``` 代码块包裹", () => {
    const t = parseTopics("```json\n" + TOPICS_JSON + "\n```");
    expect(t).toHaveLength(2);
  });
});
