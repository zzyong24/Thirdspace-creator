import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { runTopicNode, parseTopics } from "./topic-node";

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

const TOPICS = [
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
];
// T-025:runTopicNode 改走 generateObject(顶层对象 { topics:[...] });裸数组仅供 parseTopics 工具测试。
const TOPICS_OBJECT_JSON = JSON.stringify({ topics: TOPICS });
const TOPICS_ARRAY_JSON = JSON.stringify(TOPICS);

describe("runTopicNode", () => {
  it("在 Agent Runtime 上产出可解析选题 + 发步骤事件", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(TOPICS_OBJECT_JSON),
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

  it("空 topics(模型没产出选题)→ 抛错(让任务进终态,不假成功)", async () => {
    // 合法但空的结构化输出 → normalizeTopics 产 0 条 → guard 触发(不假成功)。
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(JSON.stringify({ topics: [] })),
    });
    await expect(
      runTopicNode({ model, positioningBrief: "x", basis: "positioning" }),
    ).rejects.toThrow(/未产出可解析选题/);
  });

  it("[T-062b gate-F3] KNOW-X 修真:知识库参考 + 已验证经验约束真进 prompt;空库诚实标注", async () => {
    // 捕获发给模型的 prompt,断言两个 facet 段真被注入(SPEC §7-3 的单测形式)。
    let captured = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        captured = JSON.stringify(opts.prompt);
        return finalText(TOPICS_OBJECT_JSON);
      },
    });
    await runTopicNode({
      model,
      positioningBrief: "定位X",
      basis: "positioning",
      knowledgeBrief: "· 俩小时做小程序逐字稿 (transcript)",
      learningsBrief: "· 完播率高的都在前 3 秒放结论",
    });
    expect(captured).toContain("--- 知识库参考 ---");
    expect(captured).toContain("俩小时做小程序逐字稿");
    expect(captured).toContain("--- 已验证经验约束 ---");
    expect(captured).toContain("前 3 秒放结论");

    // 空库 → 「(暂无沉淀)」诚实标注,不编内容。
    let captured2 = "";
    const model2 = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        captured2 = JSON.stringify(opts.prompt);
        return finalText(TOPICS_OBJECT_JSON);
      },
    });
    await runTopicNode({ model: model2, positioningBrief: "x", basis: "trend" });
    expect(captured2).toContain("（暂无沉淀）");
  });

  it("parseTopics 容忍 ``` 代码块包裹(纯工具,仍导出)", () => {
    const t = parseTopics("```json\n" + TOPICS_ARRAY_JSON + "\n```");
    expect(t).toHaveLength(2);
  });

  it("[T-066] sourceComments 缺字段 → 默认 [](schema default,旧模型输出不炸)", async () => {
    // TOPICS 固定数据不带 sourceComments —— 走完整链路后每条都兜成空数组。
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(TOPICS_OBJECT_JSON),
    });
    const res = await runTopicNode({
      model,
      positioningBrief: "x",
      basis: "positioning",
    });
    expect(res.topics[0]?.sourceComments).toEqual([]);
    expect(res.topics[1]?.sourceComments).toEqual([]);
  });

  it("[T-066] sourceComments 逐字透传(结构化路径 normalizeTopics)", async () => {
    const withComments = {
      topics: [
        {
          ...TOPICS[0],
          sourceComments: [
            "博主,KV cache 到底怎么压?求实测",
            "MLA 有没有单卡能跑的复现代码?",
          ],
        },
      ],
    };
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(JSON.stringify(withComments)),
    });
    const res = await runTopicNode({
      model,
      positioningBrief: "x",
      basis: "comments",
    });
    expect(res.topics[0]?.sourceComments).toEqual([
      "博主,KV cache 到底怎么压?求实测",
      "MLA 有没有单卡能跑的复现代码?",
    ]);
  });

  it("[T-066] parseTopics(文本兜底工具)asStrings 容错:滤非字符串/空串+去重,缺字段兜 []", () => {
    const raw = JSON.stringify([
      {
        title: "选题 A",
        // 混入非字符串/空串/重复(MiniMax 真机实测会把同一条评论贴 3 次)。
        sourceComments: ["原始评论一", 42, "  ", "原始评论二", "原始评论一"],
      },
      { title: "选题 B" }, // 无 sourceComments 字段
    ]);
    const t = parseTopics(raw);
    expect(t[0]?.sourceComments).toEqual(["原始评论一", "原始评论二"]);
    expect(t[1]?.sourceComments).toEqual([]);
  });

  it("[T-066] prompt 里带「逐字贴出原始评论」输出约束(模板层保证)", async () => {
    let captured = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        captured = JSON.stringify(opts.prompt);
        return finalText(TOPICS_OBJECT_JSON);
      },
    });
    await runTopicNode({ model, positioningBrief: "x", basis: "comments" });
    expect(captured).toContain("sourceComments");
    expect(captured).toContain("逐字贴出");
  });
});
