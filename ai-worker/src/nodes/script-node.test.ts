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

  it("[T-081] extraBrief(对话洞察/补充指令)注入 prompt;不传则该段省略", async () => {
    let seenPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        seenPrompt = JSON.stringify((opts as { prompt?: unknown }).prompt ?? "");
        return finalText(SHOTS_OBJECT_JSON);
      },
    });
    await runScriptNode({
      model,
      positioningBrief: "AI 工程科普,面向开发者",
      extraBrief: "按刚聊定的三段式结构写 EXTRA_MARKER",
    });
    expect(seenPrompt).toContain("本次生成指令");
    expect(seenPrompt).toContain("EXTRA_MARKER");

    await runScriptNode({ model, positioningBrief: "AI 工程科普" });
    expect(seenPrompt).not.toContain("本次生成指令");
    expect(seenPrompt).not.toContain("EXTRA_MARKER");
  });

  // [T-146 切片 c] 高优先用户素材 → 「【用户第一手资料 · 最高优先 · 必须遵守】」硬约束段 +
  // 「事实忠于资料、表达角度自由」的 gate 平衡说明。normal 优先素材 → 普通参考段(非硬约束)。
  it("[T-146c] userMaterialHardBrief(高优先)→ 「必须遵守」硬约束段 + 表达自由说明", async () => {
    let seenPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        seenPrompt = JSON.stringify((opts as { prompt?: unknown }).prompt ?? "");
        return finalText(SHOTS_OBJECT_JSON);
      },
    });
    // 调用方(creative-context.formatUserMaterialBrief)已装配含「最高优先 · 必须遵守」段头。
    await runScriptNode({
      model,
      positioningBrief: "带货博主,面向宝妈",
      userMaterialHardBrief:
        "【用户第一手资料 · 最高优先 · 必须遵守】\n【要点】续航 20 小时\n【事实】机身重 180g\n【卖点】静音降噪",
    });
    // 硬约束段头(套 positioning「必须遵守」范式)
    expect(seenPrompt).toContain("最高优先");
    expect(seenPrompt).toContain("必须遵守");
    // 要点卡内容真进了 prompt
    expect(seenPrompt).toContain("续航 20 小时");
    expect(seenPrompt).toContain("静音降噪");
    // gate 平衡:表达角度/钩子/结构留给 AI 自由发挥(防复读机)
    expect(seenPrompt).toContain("角度");
  });

  it("[T-146c] userMaterialRefBrief(normal 优先)→ 参考段,非「必须遵守」硬约束", async () => {
    let seenPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        seenPrompt = JSON.stringify((opts as { prompt?: unknown }).prompt ?? "");
        return finalText(SHOTS_OBJECT_JSON);
      },
    });
    await runScriptNode({
      model,
      positioningBrief: "带货博主,面向宝妈",
      userMaterialRefBrief: "· AI 找的参考资料:同类竞品普遍 15 小时续航",
    });
    // 参考内容进 prompt
    expect(seenPrompt).toContain("同类竞品普遍 15 小时续航");
    // 但不套「最高优先 · 必须遵守」硬约束头(它是参考级)
    expect(seenPrompt).not.toContain("最高优先 · 必须遵守");
  });

  it("[T-146c] 不传素材 brief → 两段都省略(不注空噪声)", async () => {
    let seenPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        seenPrompt = JSON.stringify((opts as { prompt?: unknown }).prompt ?? "");
        return finalText(SHOTS_OBJECT_JSON);
      },
    });
    await runScriptNode({ model, positioningBrief: "x" });
    // [T-275] 探针改探「真绑定时才出现的段头」:script.draft 模板正文本身(叙事纪律 v4)已会
    // 提及「用户第一手资料」当引导词,故不能再拿裸词当「素材段有没有注入」的探针。素材段真注入
    // 时才有的唯一标记 = 硬素材段头「最高优先 · 必须遵守」/ 参考素材段头「创作者素材（参考级）」。
    expect(seenPrompt).not.toContain("最高优先 · 必须遵守");
    expect(seenPrompt).not.toContain("创作者素材（参考级）");
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
