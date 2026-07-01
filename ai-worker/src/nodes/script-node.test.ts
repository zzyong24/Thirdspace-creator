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

const SHOTS = [
  { 口播: "你以为 KV cache 省不了?", 画面: "对比图", 字幕: "省显存", 时长: "0-3s" },
  { 口播: "三步压到 1/10", 画面: "代码滚动", 字幕: "上代码", 时长: "3-30s" },
  { 口播: "点赞收藏,下条讲量化", 画面: "口播", 字幕: "关注", 时长: "30-35s" },
];
// T-023:runScriptNode 改走 generateObject(顶层对象 { shots:[...] });裸数组仅供 parseShots 工具测试。
const SHOTS_OBJECT_JSON = JSON.stringify({ shots: SHOTS });
const SHOTS_ARRAY_JSON = JSON.stringify(SHOTS);

describe("runScriptNode", () => {
  it("在 Vercel AI SDK 上产出可解析分镜(4 字段独立)+ 步骤事件", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(SHOTS_OBJECT_JSON),
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

  it("SEAM-01:策划产物(论点树/合同/结构方案)注入 prompt", async () => {
    let seenPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        // 抓最后一条 user message 的文本,断言策划产物确实进了 prompt。
        const msgs = (opts as { prompt?: unknown }).prompt;
        seenPrompt = JSON.stringify(msgs ?? "");
        return finalText(SHOTS_OBJECT_JSON);
      },
    });
    await runScriptNode({
      model,
      positioningBrief: "AI 工程科普,面向开发者",
      thesisBrief: "【核心论点】KV cache 可压到 1/10",
      contractBrief: "· 受众定位：后端工程师",
      outlineBrief: "结构类型：问题-解决\n段落安排：\n  1. 钩子：反差",
    });
    expect(seenPrompt).toContain("KV cache 可压到 1/10");
    expect(seenPrompt).toContain("后端工程师");
    expect(seenPrompt).toContain("问题-解决");
    expect(seenPrompt).toContain("策划结构方案");
  });

  it("空 shots(模型没产出分镜)→ 抛错(不假成功)", async () => {
    // 合法但空的结构化输出 → runScriptNode 的 empty guard 触发(不摆空格子)。
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(JSON.stringify({ shots: [] })),
    });
    await expect(
      runScriptNode({ model, positioningBrief: "x" }),
    ).rejects.toThrow(/未产出可解析分镜/);
  });

  it("parseShots 容忍 ``` 包裹(纯工具,仍导出)", () => {
    const s = parseShots("```json\n" + SHOTS_ARRAY_JSON + "\n```");
    expect(s).toHaveLength(3);
  });
});
