import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  collectTrendSourceSignals,
  formatTrendSourceBrief,
  TREND_SOURCE_TEXT_LIMIT,
  type TrendSourceProjection,
  type TrendSourceSignal,
  type TrendSourceSignalsDeps,
} from "./trend-source-signals";
import {
  assembleTrendBrief,
  assembleTrendBriefDetailed,
} from "./topic-task-adapter";

// [T-235b] 信源信号采集单测:web 主路(readUrl→AI 抽取)/ rss 辅路(feed 解析)分流、
// 单源失败跳过不拖垮、正文截断、诚实空;brief 拼装(heat null 不编);多源并行装配。

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const webSource: TrendSourceProjection = {
  id: "s1",
  name: "36氪热榜",
  url: "https://36kr.com/hot",
  sourceType: "web",
  domain: "36kr.com",
};
const rssSource: TrendSourceProjection = {
  id: "s2",
  name: "少数派",
  url: "https://sspai.com/feed",
  sourceType: "rss",
  domain: "sspai.com",
};

function makeDeps(
  overrides: Partial<TrendSourceSignalsDeps> = {},
): TrendSourceSignalsDeps {
  return {
    listEnabledSources: async () => [webSource],
    readWebSource: async () => ({ text: "热榜正文……" }),
    extractSignals: async () => [
      { title: "大模型又降价了", url: "https://x.com/1", heat: 123000, publishedAt: null },
    ],
    fetchRssSignals: async () => [],
    ...overrides,
  };
}

describe("collectTrendSourceSignals", () => {
  it("web 型走 readUrl+AI 抽取,信号带 sourceName;rss 型走 feed 解析不调 AI", async () => {
    const extractSignals = vi.fn(async () => [
      { title: "热榜第一", url: null, heat: null, publishedAt: null },
    ]);
    const fetchRssSignals = vi.fn(async (): Promise<TrendSourceSignal[]> => [
      { title: "feed 条目", url: "https://sspai.com/1", heat: null, publishedAt: "2026-07-11", sourceName: "少数派" },
    ]);
    const out = await collectTrendSourceSignals(ctx, makeDeps({
      listEnabledSources: async () => [webSource, rssSource],
      extractSignals,
      fetchRssSignals,
    }));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: "热榜第一", heat: null, sourceName: "36氪热榜" });
    expect(out[1]!.sourceName).toBe("少数派");
    expect(extractSignals).toHaveBeenCalledTimes(1); // 只 web 源调 AI
    expect(fetchRssSignals).toHaveBeenCalledTimes(1);
  });

  it("单源失败(登录墙/模型未配)→ 跳过该源不拖垮其余;全失败 → [](诚实空)", async () => {
    const out = await collectTrendSourceSignals(ctx, makeDeps({
      listEnabledSources: async () => [webSource, rssSource],
      readWebSource: async () => {
        throw new Error("需要先登录才能读到正文");
      },
      fetchRssSignals: async () => [
        { title: "rss 仍活着", url: null, heat: null, publishedAt: null, sourceName: "少数派" },
      ],
    }));
    expect(out.map((s) => s.title)).toEqual(["rss 仍活着"]);

    const allFail = await collectTrendSourceSignals(ctx, makeDeps({
      listEnabledSources: async () => [webSource],
      extractSignals: async () => {
        throw new Error("未配文本模型");
      },
    }));
    expect(allFail).toEqual([]);
  });

  it("正文截断到 TREND_SOURCE_TEXT_LIMIT;空正文/空标题条目被过滤;每源上限截断", async () => {
    const extractSignals = vi.fn(async (_c: RequestContext, input: { pageText: string }) => {
      expect(input.pageText.length).toBe(TREND_SOURCE_TEXT_LIMIT);
      return [
        { title: "", url: null, heat: null, publishedAt: null }, // 空标题 = 噪声,过滤
        ...Array.from({ length: 12 }, (_, i) => ({
          title: `条目${i}`,
          url: null,
          heat: null,
          publishedAt: null,
        })),
      ];
    });
    const out = await collectTrendSourceSignals(ctx, makeDeps({
      readWebSource: async () => ({ text: "长".repeat(TREND_SOURCE_TEXT_LIMIT + 500) }),
      extractSignals: extractSignals as unknown as TrendSourceSignalsDeps["extractSignals"],
    }));
    expect(out).toHaveLength(8); // 默认每源 8 条上限
    expect(out[0]!.title).toBe("条目0");

    const empty = await collectTrendSourceSignals(ctx, makeDeps({
      readWebSource: async () => ({ text: "   " }),
    }));
    expect(empty).toEqual([]); // 空正文 → 跳过该源,不喂 AI
  });

  it("无 enabled 信源 / 列表读失败 → [](诚实空,不崩)", async () => {
    expect(
      await collectTrendSourceSignals(ctx, makeDeps({ listEnabledSources: async () => [] })),
    ).toEqual([]);
    expect(
      await collectTrendSourceSignals(ctx, makeDeps({
        listEnabledSources: async () => {
          throw new Error("db down");
        },
      })),
    ).toEqual([]);
  });
});

describe("formatTrendSourceBrief", () => {
  it("heat/url/时间有则带、无则不编;空数组 → 空串", () => {
    const brief = formatTrendSourceBrief([
      { title: "有热度", url: "https://x.com/1", heat: 123000, publishedAt: "2026-07-11", sourceName: "36氪热榜" },
      { title: "无热度", url: null, heat: null, publishedAt: null, sourceName: "少数派" },
    ]);
    expect(brief).toContain("【已登记信源信号】");
    expect(brief).toContain("1. 有热度 —— 热度 123000 —— 发布 2026-07-11 —— https://x.com/1(来源:36氪热榜)");
    expect(brief).toContain("2. 无热度(来源:少数派)"); // 无热度不出现「热度」字样,不编
    expect(brief).not.toMatch(/2\. 无热度.*热度 /);
    expect(formatTrendSourceBrief([])).toBe("");
  });
});

describe("assembleTrendBrief 多源并行(信源信号 + web 搜索)", () => {
  it("两路都有 → 分段拼接(信源段在前);单路失败只丢该段;全空 → 空串", async () => {
    const both = await assembleTrendBrief(ctx, "母婴定位", {
      trendSourceSignals: async () => [
        { title: "信源条目", url: null, heat: null, publishedAt: null, sourceName: "36氪热榜" },
      ],
      trendSearch: async () => [{ title: "搜索命中", snippet: "摘要" }],
    });
    expect(both.indexOf("【已登记信源信号】")).toBeLessThan(
      both.indexOf("【当前热点(联网检索)】"),
    );

    const searchOnly = await assembleTrendBrief(ctx, "母婴定位", {
      trendSourceSignals: async () => {
        throw new Error("信源整体失败");
      },
      trendSearch: async () => [{ title: "搜索命中" }],
    });
    expect(searchOnly).toContain("搜索命中");
    expect(searchOnly).not.toContain("【已登记信源信号】");

    const none = await assembleTrendBrief(ctx, "母婴定位", {});
    expect(none).toBe("");
  });
});

// [T-245] 明细装配(additive):brief 与 assembleTrendBrief 完全一致,另带两路条数,
// 供对话编导在信源信号为空时产诚实降级注记(「本次未拉到信源信号」),不猜不编。
describe("assembleTrendBriefDetailed 装配明细(T-245)", () => {
  it("两路条数如实计数;brief 与 assembleTrendBrief 同值;端口未绑/失败 → 0", async () => {
    const deps = {
      trendSourceSignals: async () => [
        { title: "信源条目", url: null, heat: null, publishedAt: null, sourceName: "36氪热榜" },
      ],
      trendSearch: async () => [
        { title: "搜索命中A" },
        { title: "搜索命中B" },
      ],
    };
    const detail = await assembleTrendBriefDetailed(ctx, "母婴定位", deps);
    expect(detail.sourceSignalCount).toBe(1);
    expect(detail.searchHitCount).toBe(2);
    expect(detail.brief).toBe(await assembleTrendBrief(ctx, "母婴定位", deps));

    const none = await assembleTrendBriefDetailed(ctx, "母婴定位", {});
    // [T-238] additive:sourceNameCount(distinct 已登记信源名,质量画像「几路信源」用)。
    expect(none).toEqual({
      brief: "",
      sourceSignalCount: 0,
      searchHitCount: 0,
      sourceNameCount: 0,
    });

    const failed = await assembleTrendBriefDetailed(ctx, "母婴定位", {
      trendSourceSignals: async () => {
        throw new Error("信源整体失败");
      },
      trendSearch: async () => [{ title: "搜索命中" }],
    });
    expect(failed.sourceSignalCount).toBe(0);
    expect(failed.searchHitCount).toBe(1);
  });
});
