import { describe, it, expect } from "vitest";
import { bindPrompt } from "../template";
import {
  TREND_EXTRACT_TEMPLATE,
  trendExtractSchema,
} from "./trend-extract";

// [T-235b] trend.extract 模板/契约单测 —— schema 宽容缺字段(跨模型稳)+ 诚实门形状
// (heat/url/publishedAt 缺 → null 不编)+ facets 绑定。

describe("trend.extract 输出 schema", () => {
  it("缺字段的条目过校验并回填 null/默认(跨模型宽容)", () => {
    const parsed = trendExtractSchema.parse({
      signals: [{ title: "AI 圈今日大新闻" }],
    });
    expect(parsed.signals[0]).toEqual({
      title: "AI 圈今日大新闻",
      url: null,
      heat: null,
      publishedAt: null,
    });
  });

  it("完整条目原样通过;顶层缺 signals → 空数组", () => {
    const parsed = trendExtractSchema.parse({
      signals: [
        {
          title: "热榜第一",
          url: "https://x.com/1",
          heat: 123000,
          publishedAt: "2026-07-11",
        },
      ],
    });
    expect(parsed.signals[0]!.heat).toBe(123000);
    expect(trendExtractSchema.parse({}).signals).toEqual([]);
  });

  it("heat 传字符串等非法类型 → 校验失败(诚实门:不静默吞脏类型)", () => {
    expect(() =>
      trendExtractSchema.parse({ signals: [{ title: "x", heat: "很多" }] }),
    ).toThrow();
  });

  it("模板绑定 facets:sourceName/pageText 必需,注入后进 prompt", () => {
    const { system, prompt } = bindPrompt(TREND_EXTRACT_TEMPLATE, {
      sourceName: "36氪热榜",
      pageText: "1. 大模型又降价了 12.3万热度",
    });
    expect(system).toContain("绝不编造");
    expect(prompt).toContain("36氪热榜");
    expect(prompt).toContain("大模型又降价了");
    // 缺必需 facet → bindPrompt 抛错。
    expect(() => bindPrompt(TREND_EXTRACT_TEMPLATE, { sourceName: "x" })).toThrow();
  });
});
