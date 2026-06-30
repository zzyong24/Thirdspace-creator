import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import {
  runResearchNode,
  parseMaterials,
  anthropicWebSearchTools,
} from "./research-node";

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

const MATERIALS_JSON = JSON.stringify([
  {
    title: "MLA 显存实测",
    url: "https://example.com/mla",
    source: "arXiv",
    why_relevant: "给定位里的工程化论文精读提供可复现数据",
  },
  {
    title: "对标账号近期爆款拆解",
    url: "https://example.com/bench",
    source: "公众号",
    why_relevant: "对齐定位的对标信号",
  },
]);

describe("runResearchNode", () => {
  it("在 Vercel AI SDK 上产出可解析素材 + 步骤事件", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(MATERIALS_JSON),
    });
    const steps: number[] = [];
    const res = await runResearchNode({
      model,
      positioningBrief: "AI 工程科普,面向开发者",
      topicTitle: "复现 MLA",
      topicAngle: "先跑数",
      onStep: (e) => {
        steps.push(e.stepNo);
      },
    });
    expect(res.items).toHaveLength(2);
    expect(res.items[0]?.title).toContain("MLA");
    expect(res.items[0]?.why_relevant).toBeTruthy();
    expect(res.steps.length).toBeGreaterThanOrEqual(1);
    expect(steps).toContain(1);
  });

  it("无可解析素材 → 抛错(不假成功)", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText("抱歉,我没搜到。"),
    });
    await expect(
      runResearchNode({ model, positioningBrief: "x", topicTitle: "t" }),
    ).rejects.toThrow(/未产出可解析素材/);
  });

  it("parseMaterials 容忍 ``` 包裹并丢弃无 title 项", () => {
    const withEmpty = JSON.stringify([
      { title: "", url: "u", source: "s", why_relevant: "w" },
      { title: "有标题", url: "u2", source: "s2", why_relevant: "w2" },
    ]);
    const items = parseMaterials("```json\n" + withEmpty + "\n```");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("有标题");
  });

  it("anthropicWebSearchTools 暴露 provider 内置 web_search 工具(随模型计费,不引第三方)", () => {
    const tools = anthropicWebSearchTools();
    expect(tools.web_search).toBeDefined();
  });
});
