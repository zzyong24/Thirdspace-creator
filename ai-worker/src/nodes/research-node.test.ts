import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import {
  runResearchNode,
  flattenCategories,
  formatSearchResultsFacet,
  anthropicWebSearchTools,
  type ResearchCategories,
} from "./research-node";
import type { SearchResult } from "../runtime/search-factory";

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
      cases: [{ title: "", source: "s", opening: "o", sourceUrl: "" }],
      dataPoints: [{ stat: "  ", source: "x", sourceUrl: "" }],
      quotes: [{ line: "金句在" }],
    };
    const items = flattenCategories(cats);
    // 只剩「有钩子」+「金句在」两条
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe("钩子：有钩子");
    expect(items[1]?.title).toBe("金句：金句在");
  });

  // [T-084a] sourceUrl 透传:cases/dataPoints 带检索真实 URL → MaterialItem.sourceUrl + url 镜像。
  it("flattenCategories 透传 cases/dataPoints 的 sourceUrl(url 镜像存证)", () => {
    const cats: ResearchCategories = {
      hooks: [],
      cases: [
        {
          title: "真案例",
          source: "机构报告",
          opening: "起",
          sourceUrl: "https://example.com/report",
        },
      ],
      dataPoints: [{ stat: "42%", source: "记忆", sourceUrl: "" }],
      quotes: [],
    };
    const items = flattenCategories(cats);
    expect(items).toHaveLength(2);
    // 带 sourceUrl 的:sourceUrl + url 都是真实 URL
    expect(items[0]?.sourceUrl).toBe("https://example.com/report");
    expect(items[0]?.url).toBe("https://example.com/report");
    // 无 sourceUrl 的:sourceUrl 字段不存在(undefined),url 空
    expect(items[1]?.sourceUrl).toBeUndefined();
    expect(items[1]?.url).toBe("");
  });

  // [T-084a] grounding 打标:有 searchResults=web,无=model_memory。
  it("有 searchResults 入参 → grounding=web 且检索块进 prompt", async () => {
    let capturedPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        capturedPrompt = JSON.stringify(opts.prompt);
        return finalText(FOUR_CATEGORIES);
      },
    });
    const searchResults: SearchResult[] = [
      {
        title: "RAG 客服复盘",
        url: "https://blog.example.com/rag",
        snippet: "把响应时间砍到 1/5",
        siteName: "example.com",
      },
    ];
    const res = await runResearchNode({
      model,
      positioningBrief: "AI 工程科普",
      topicTitle: "AI 提效",
      searchResults,
    });
    expect(res.grounding).toBe("web");
    // 检索块真进了 prompt(「今日抓取」块标记 + 编号 + URL)
    expect(capturedPrompt).toContain("真实,今日抓取");
    expect(capturedPrompt).toContain("https://blog.example.com/rag");
  });

  it("无 searchResults(未配/降级)→ grounding=model_memory,prompt 无检索块", async () => {
    let capturedPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        capturedPrompt = JSON.stringify(opts.prompt);
        return finalText(FOUR_CATEGORIES);
      },
    });
    const res = await runResearchNode({
      model,
      positioningBrief: "x",
      topicTitle: "t",
    });
    expect(res.grounding).toBe("model_memory");
    // 无检索块(「今日抓取」块标记不出现;信源铁律静态文本仍在,故只断块标记)
    expect(capturedPrompt).not.toContain("真实,今日抓取");
  });

  it("formatSearchResultsFacet 空数组 → 空串(不注空噪声)", () => {
    expect(formatSearchResultsFacet([])).toBe("");
  });

  it("formatSearchResultsFacet 带编号 + URL + 摘要 + 来源元数据", () => {
    const block = formatSearchResultsFacet([
      {
        title: "标题A",
        url: "https://a.com",
        snippet: "摘要A",
        siteName: "a.com",
        publishedAt: "2026-07-01",
      },
    ]);
    expect(block).toContain("[1] 标题A");
    expect(block).toContain("URL: https://a.com");
    expect(block).toContain("摘要A");
    expect(block).toContain("a.com · 2026-07-01");
  });

  it("anthropicWebSearchTools 仍暴露 provider 内置 web_search(真 Anthropic 路径备用)", () => {
    const tools = anthropicWebSearchTools();
    expect(tools.web_search).toBeDefined();
  });
});
