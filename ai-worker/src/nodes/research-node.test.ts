import { describe, it, expect } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import {
  runResearchNode,
  flattenCategories,
  formatSearchResultsFacet,
  formatUserMaterialFacet,
  hasPseudoCitation,
  sanitizeModelMemoryCategories,
  MODEL_MEMORY_SOURCE_LABEL,
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
    // 钩子的 why → why_relevant;案例的 opening → why_relevant
    expect(res.items[0]?.why_relevant).toContain("反直觉");
    // [T-228] 本 run 无 searchResults(grounding=model_memory)→ source 被诚实门归一为
    // 「模型记忆,需核实」(不留看似真实的出处);web 路径的 source 保留见 T-228 测试组。
    expect(res.items[1]?.source).toBe(MODEL_MEMORY_SOURCE_LABEL);
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

  it("[T-486] 首次四类全空时由输出契约触发重试，第二次有效素材可恢复", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        return finalText(
          calls === 1
            ? JSON.stringify({
                hooks: [],
                cases: [],
                dataPoints: [],
                quotes: [],
              })
            : FOUR_CATEGORIES,
        );
      },
    });
    const result = await runResearchNode({
      model,
      positioningBrief: "AI 工程科普,面向开发者",
      topicTitle: "AI 工具帮普通人省时间",
    });
    expect(calls).toBe(2);
    expect(result.items).toHaveLength(4);
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

  // [T-146 切片 d] 用户第一手资料要点 facet:综合应「优先服务于它、补充它、佐证它」而非跑题。
  it("[T-146d] formatUserMaterialFacet 空串 → 空串(不注空噪声)", () => {
    expect(formatUserMaterialFacet("")).toBe("");
    expect(formatUserMaterialFacet("   ")).toBe("");
  });

  it("[T-146d] formatUserMaterialFacet 有要点 → 块标 + 服务于资料的提示 + 要点原文", () => {
    const block = formatUserMaterialFacet(
      "【要点】续航 20 小时\n【卖点】静音降噪",
    );
    expect(block).toContain("创作者第一手资料");
    // 提示综合优先服务/补充/佐证该资料(非跑题)
    expect(block).toContain("佐证");
    expect(block).toContain("续航 20 小时");
    expect(block).toContain("静音降噪");
  });

  it("[T-146d] userMaterialFacet 入参 → 资料要点块真进 research prompt", async () => {
    let capturedPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        capturedPrompt = JSON.stringify(opts.prompt);
        return finalText(FOUR_CATEGORIES);
      },
    });
    await runResearchNode({
      model,
      positioningBrief: "带货博主",
      topicTitle: "降噪耳机测评",
      userMaterialFacet: formatUserMaterialFacet("【卖点】主动降噪 40dB"),
    });
    expect(capturedPrompt).toContain("创作者第一手资料");
    expect(capturedPrompt).toContain("主动降噪 40dB");
  });

  it("[T-146d] 不传 userMaterialFacet → 资料块整段省略", async () => {
    let capturedPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        capturedPrompt = JSON.stringify(opts.prompt);
        return finalText(FOUR_CATEGORIES);
      },
    });
    await runResearchNode({
      model,
      positioningBrief: "x",
      topicTitle: "t",
    });
    expect(capturedPrompt).not.toContain("创作者第一手资料");
  });


});

// [T-228] 搜索诚实门:model_memory 模式禁假精度 —— 伪引用检测 + 输出后处理清洗。
// 实录病例:16 条素材只 1 条真 URL,其余是记忆编的 arXiv 2308.00352 / 85.9% pass@1 /
// SWE-bench 榜单,标「需核实」冒充真源。
describe("[T-228] hasPseudoCitation(伪引用检测)", () => {
  it.each([
    "MetaGPT 论文 arXiv 2308.00352 提出多智能体框架",
    "arxiv:2402.01030 显示……",
    "GPT-4 在 HumanEval 上 85.9% pass@1",
    "准确率提升 12.3%",
    "详见 DOI: 10.1145/3512345",
    "SWE-bench 榜单第一",
  ])("命中:%s", (text) => {
    expect(hasPseudoCitation(text)).toBe(true);
  });

  it.each([
    "90% 的人用 AI 反而更慢了", // 整数百分比 = 方向性常识,不算假精度
    "知识工作者每天大量时间在找信息",
    "2023 年之后大模型迭代明显加快",
  ])("不命中(方向性陈述):%s", (text) => {
    expect(hasPseudoCitation(text)).toBe(false);
  });
});

describe("[T-228] sanitizeModelMemoryCategories(model_memory 清洗)", () => {
  const dirty: ResearchCategories = {
    hooks: [
      { text: "90% 的人都做错了", why: "反直觉" },
      { text: "SWE-bench 榜单第一的秘密", why: "蹭榜单" },
    ],
    cases: [
      {
        title: "MetaGPT 多智能体",
        source: "arXiv 2308.00352",
        opening: "从论文讲起",
        sourceUrl: "https://fake.example.com/paper",
      },
      {
        title: "某团队用 RAG 提效",
        source: "斯坦福 2024 报告",
        opening: "先抛结果",
        sourceUrl: "",
      },
    ],
    dataPoints: [
      { stat: "GPT-4 达到 85.9% pass@1", source: "需核实", sourceUrl: "" },
      { stat: "多数团队没有知识管理流程", source: "行业共识", sourceUrl: "" },
    ],
    quotes: [{ line: "工具不会替你思考" }],
  };

  it("伪引用条目整条剔除(arXiv 案例 / 85.9% 数据点 / 榜单钩子),dropped 计数", () => {
    const { categories, dropped } = sanitizeModelMemoryCategories(dirty);
    expect(dropped).toBe(3);
    expect(categories.hooks.map((h) => h.text)).toEqual(["90% 的人都做错了"]);
    expect(categories.cases.map((c) => c.title)).toEqual(["某团队用 RAG 提效"]);
    expect(categories.dataPoints.map((d) => d.stat)).toEqual([
      "多数团队没有知识管理流程",
    ]);
    expect(categories.quotes).toHaveLength(1);
  });

  it("存留的 cases/dataPoints:sourceUrl 强制清空,source 归一「模型记忆,需核实」(不留看似真实的出处)", () => {
    const { categories } = sanitizeModelMemoryCategories(dirty);
    for (const c of categories.cases) {
      expect(c.sourceUrl).toBe("");
      expect(c.source).toBe(MODEL_MEMORY_SOURCE_LABEL);
    }
    for (const d of categories.dataPoints) {
      expect(d.sourceUrl).toBe("");
      expect(d.source).toBe(MODEL_MEMORY_SOURCE_LABEL);
    }
  });

  it("runResearchNode 无检索结果 → 清洗生效:伪引用条目被剔、来源归一、降级硬约束块进 prompt", async () => {
    let capturedPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        capturedPrompt = JSON.stringify(opts.prompt);
        return finalText(JSON.stringify(dirty));
      },
    });
    const res = await runResearchNode({
      model,
      positioningBrief: "x",
      topicTitle: "AI 工具",
    });
    expect(res.grounding).toBe("model_memory");
    // 伪引用条目不在产物里
    const titles = res.items.map((i) => i.title).join("|");
    expect(titles).not.toContain("MetaGPT");
    expect(titles).not.toContain("85.9%");
    expect(titles).not.toContain("SWE-bench");
    // 来源归一 + 编造 URL 清空
    const caseItem = res.items.find((i) => i.title.startsWith("案例："));
    expect(caseItem?.source).toBe(MODEL_MEMORY_SOURCE_LABEL);
    expect(caseItem?.url).toBe("");
    // 降级硬约束块真进了 prompt
    expect(capturedPrompt).toContain("降级模式");
    expect(capturedPrompt).toContain("绝不编造任何具体引用");
  });

  it("runResearchNode 有检索结果(web)→ 不清洗(真实检索路径不动)", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(JSON.stringify(dirty)),
    });
    const results: SearchResult[] = [
      { title: "t", url: "https://real.example.com/a", snippet: "s" },
    ];
    const res = await runResearchNode({
      model,
      positioningBrief: "x",
      topicTitle: "AI 工具",
      searchResults: results,
    });
    expect(res.grounding).toBe("web");
    // web 路径保留模型标注(含 arXiv 案例 —— 模型可能真引用了检索结果)
    expect(res.items.map((i) => i.title).join("|")).toContain("MetaGPT");
  });

  it("清洗后全空 → 抛「全部为编造引用」诚实错误(不假成功)", async () => {
    const allFake: ResearchCategories = {
      hooks: [],
      cases: [
        {
          title: "MetaGPT",
          source: "arXiv 2308.00352",
          opening: "",
          sourceUrl: "",
        },
      ],
      dataPoints: [{ stat: "85.9% pass@1", source: "", sourceUrl: "" }],
      quotes: [],
    };
    const model = new MockLanguageModelV4({
      doGenerate: async () => finalText(JSON.stringify(allFake)),
    });
    await expect(
      runResearchNode({ model, positioningBrief: "x", topicTitle: "t" }),
    ).rejects.toThrow(/编造引用/);
  });
});
