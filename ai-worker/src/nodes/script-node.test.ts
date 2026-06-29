import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { runScriptNode, parseShots } from "./script-node";

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

const SHOTS_JSON = JSON.stringify([
  { 口播: "你以为 KV cache 省不了?", 画面: "对比图", 字幕: "省显存", 时长: "0-3s" },
  { 口播: "三步压到 1/10", 画面: "代码滚动", 字幕: "上代码", 时长: "3-30s" },
  { 口播: "点赞收藏,下条讲量化", 画面: "口播", 字幕: "关注", 时长: "30-35s" },
]);

describe("runScriptNode", () => {
  it("在 Vercel AI SDK 上产出可解析分镜(4 字段独立)+ 步骤事件", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(SHOTS_JSON),
    });
    const steps: number[] = [];
    const res = await runScriptNode({
      model,
      positioningBrief: "AI 工程科普,面向开发者",
      topicTitle: "复现 MLA",
      topicAngle: "先跑数",
      onStep: (e) => {
        steps.push(e.stepNo);
      },
    });
    expect(res.shots).toHaveLength(3);
    expect(res.shots[0]?.口播).toContain("KV cache");
    expect(res.shots[0]?.时长).toBe("0-3s");
    expect(res.steps.length).toBeGreaterThanOrEqual(1);
    expect(steps).toContain(1);
  });

  it("无可解析分镜 → 抛错(不假成功)", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText("抱歉,我无法完成。"),
    });
    await expect(
      runScriptNode({ model, positioningBrief: "x" }),
    ).rejects.toThrow(/未产出可解析分镜/);
  });

  it("parseShots 容忍 ``` 包裹", () => {
    const s = parseShots("```json\n" + SHOTS_JSON + "\n```");
    expect(s).toHaveLength(3);
  });
});
