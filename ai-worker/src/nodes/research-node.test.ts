import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import {
  runResearchNode,
  flattenCategories,
  anthropicWebSearchTools,
  type ResearchCategories,
} from "./research-node";

// generateObject(JSON mode)解析模型吐的文本为对象 → 卡 outputSchema。Mock 直接回 JSON 文本。
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

// 四类创作向候选(钩子/案例/数据点/金句)—— schema 强约束的合法输出。
const FOUR_CATEGORIES = JSON.stringify({
  hooks: [
    { text: "90% 的人用 AI 反而更慢了", why: "反直觉数字开头,制造认知缺口" },
  ],
  cases: [
    {
      title: "某团队用 RAG 把客服响应砍到 1/5",
      source: "公开复盘",
      opening: "先抛结果数字,再倒推他们怎么做的",
    },
  ],
  dataPoints: [{ stat: "知识工作者每天 28% 时间在找信息", source: "需核实" }],
  quotes: [{ line: "工具不会替你思考,只会放大你的思考" }],
});

describe("runResearchNode（结构化四类候选)", () => {
  it("用 generateObject 绑 outputSchema 产四类候选 + 摊平成 MaterialItem[]", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(FOUR_CATEGORIES),
    });
    const res = await runResearchNode({
      model,
      positioningBrief: "AI 工程科普,面向开发者",
      topicTitle: "AI 工具帮普通人省时间",
      topicAngle: "反直觉开头",
    });
    // 四类原样回带
    expect(res.categories.hooks).toHaveLength(1);
    expect(res.categories.cases).toHaveLength(1);
    expect(res.categories.dataPoints).toHaveLength(1);
    expect(res.categories.quotes).toHaveLength(1);
    // 摊平成 4 条 MaterialItem(喂既有 material_list 采纳路径),title 带分类前缀
    expect(res.items).toHaveLength(4);
    expect(res.items.map((m) => m.title.split("：")[0])).toEqual([
      "钩子",
      "案例",
      "数据",
      "金句",
    ]);
    // 钩子的 why → why_relevant;案例的 opening → why_relevant + source 保留
    expect(res.items[0]?.why_relevant).toContain("反直觉");
    expect(res.items[1]?.source).toBe("公开复盘");
  });

  it("四类全空 → 抛错(不假成功)", async () => {
    const empty = JSON.stringify({
      hooks: [],
      cases: [],
      dataPoints: [],
      quotes: [],
    });
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(empty),
    });
    await expect(
      runResearchNode({ model, positioningBrief: "x", topicTitle: "t" }),
    ).rejects.toThrow(/未产出可解析素材/);
  });

  it("flattenCategories 丢弃空主字段项(无 text/title/stat/line)", () => {
    const cats: ResearchCategories = {
      hooks: [{ text: "", why: "w" }, { text: "有钩子", why: "" }],
      cases: [{ title: "", source: "s", opening: "o" }],
      dataPoints: [{ stat: "  ", source: "x" }],
      quotes: [{ line: "金句在" }],
    };
    const items = flattenCategories(cats);
    // 只剩「有钩子」+「金句在」两条
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe("钩子：有钩子");
    expect(items[1]?.title).toBe("金句：金句在");
  });

  it("anthropicWebSearchTools 仍暴露 provider 内置 web_search(真 Anthropic 路径备用)", () => {
    const tools = anthropicWebSearchTools();
    expect(tools.web_search).toBeDefined();
  });
});
