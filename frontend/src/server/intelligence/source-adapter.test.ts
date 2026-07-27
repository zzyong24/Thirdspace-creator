import { describe, expect, it } from "vitest";

import type { RequestContext } from "@creatoros/contract";
import { createIntelligenceSourceAdapter } from "./source-adapter";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
  source: "user",
};

const baseSource = {
  id: "source-1",
  userId: "user-1",
  accountId: "account-1",
  collectionId: null,
  type: "web" as const,
  platform: "web",
  externalKey: "external-1",
  canonicalUrl: "https://example.com/article",
  displayName: "示例来源",
  browserSessionRef: null,
  extractionInstruction: null,
  monitorEnabled: true,
  syncPolicy: {},
  status: "active" as const,
  version: 1,
  lastRunAt: null,
  nextRunAt: null,
  createdAt: "2026-07-23T12:00:00.000Z",
  updatedAt: "2026-07-23T12:00:00.000Z",
  collector: null,
};

function deps() {
  return {
    now: () => "2026-07-23T12:00:00.000Z",
    fetchProfileWorks: async () => [],
    fetchFavoriteWorks: async () => [],
    readWeb: async () => ({
      text: "这是经过 Readability 提取的真实正文。",
      title: "真实网页",
      finalUrl: "https://example.com/final",
      extractor: "readability",
    }),
    fetchFeed: async () => ({
      xml: "<rss><channel><item><title>一条新闻</title><link>https://example.com/1</link></item></channel></rss>",
      finalUrl: "https://example.com/feed.xml",
    }),
    parseFeed: () => [
      {
        title: "一条新闻",
        url: "https://example.com/1",
        snippet: "摘要",
        publishedAt: "2026-07-23T10:00:00Z",
        siteName: "示例站",
      },
    ],
  };
}

describe("T-482 内容雷达来源适配器", () => {
  it("网页读取保留最终 URL、正文摘要和不可变快照哈希", async () => {
    const adapter = createIntelligenceSourceAdapter(deps());
    const result = await adapter.run(ctx, {
      source: baseSource,
      config: { type: "web", url: "https://example.com/article" },
      extractionInstruction: null,
      checkpoint: null,
    });

    expect(result.adapterStatus).toBe("succeeded_with_items");
    expect(result.upstreamEvidence).toMatchObject({
      adapter: "web",
      listValid: true,
      finalUrl: "https://example.com/final",
    });
    expect(result.items[0]).toMatchObject({
      type: "article",
      canonicalUrl: "https://example.com/final",
      title: "真实网页",
      summary: "这是经过 Readability 提取的真实正文。",
    });
    expect(result.items[0]?.snapshot?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("RSS 必须先证明是合法 Feed，普通 XML 不得伪装成成功空结果", async () => {
    const adapter = createIntelligenceSourceAdapter({
      ...deps(),
      fetchFeed: async () => ({
        xml: "<html><body>不是 feed</body></html>",
        finalUrl: "https://example.com/not-feed",
      }),
    });
    const result = await adapter.run(ctx, {
      source: { ...baseSource, type: "rss" },
      config: { type: "rss", url: "https://example.com/not-feed" },
      extractionInstruction: null,
      checkpoint: null,
    });

    expect(result).toMatchObject({
      adapterStatus: "failed",
      errorCode: "INVALID_FEED",
      items: [],
      upstreamEvidence: { listValid: false },
    });
  });

  it("[T-546] 网页 HTTP/解析异常落结构化失败，不得退化成 0 条成功或泛化异常", async () => {
    for (const code of ["HTTP_ERROR", "PARSE_FAILED"] as const) {
      const adapter = createIntelligenceSourceAdapter({
        ...deps(),
        readWeb: async () => {
          throw Object.assign(new Error("不得持久化的上游细节"), {
            name: "WebCaptureError",
            code,
          });
        },
      });
      const result = await adapter.run(ctx, {
        source: baseSource,
        config: { type: "web", url: "https://example.com/article" },
        extractionInstruction: null,
        checkpoint: null,
      });

      expect(result).toMatchObject({
        adapterStatus: "failed",
        errorCode: code,
        items: [],
        upstreamEvidence: {
          adapter: "web",
          listValid: false,
        },
        safeDiagnostics: {},
      });
      expect(JSON.stringify(result)).not.toContain("上游细节");
    }
  });

  it("[T-546] 网页登录墙落 blocked/LOGIN_WALL，不能提示普通稍后重试", async () => {
    const adapter = createIntelligenceSourceAdapter({
      ...deps(),
      readWeb: async () => {
        throw Object.assign(new Error("登录地址不得落库"), {
          name: "WebReaderLoginRequiredError",
          code: "LOGIN_WALL",
        });
      },
    });
    const result = await adapter.run(ctx, {
      source: baseSource,
      config: { type: "web", url: "https://example.com/private" },
      extractionInstruction: null,
      checkpoint: null,
    });

    expect(result).toMatchObject({
      adapterStatus: "blocked",
      errorCode: "LOGIN_WALL",
      items: [],
      upstreamEvidence: { listValid: false },
    });
  });

  it("[T-546] RSS 结构合法但解析器抛错时落 PARSE_FAILED，不得冒充空 Feed", async () => {
    const adapter = createIntelligenceSourceAdapter({
      ...deps(),
      parseFeed: () => {
        throw new Error("malformed item detail");
      },
    });
    const result = await adapter.run(ctx, {
      source: { ...baseSource, type: "rss" },
      config: { type: "rss", url: "https://example.com/feed.xml" },
      extractionInstruction: null,
      checkpoint: null,
    });

    expect(result).toMatchObject({
      adapterStatus: "failed",
      errorCode: "PARSE_FAILED",
      items: [],
      upstreamEvidence: {
        adapter: "rss",
        listValid: false,
      },
    });
  });

  it("[T-537] 热点宝使用固化 collector，仍按 48 小时三档规则过滤", async () => {
    let usedCollector: string | null = null;
    const adapter = createIntelligenceSourceAdapter({
      ...deps(),
      fetchDouhot: async ({ collectorAccountId }) => {
        usedCollector = collectorAccountId;
        return {
        listValid: true,
        officialWindow: "2d",
        responseShape: "code/data/objs",
        candidates: [
          {
            itemId: "hit",
            itemUrl: "https://www.douyin.com/video/hit",
            title: "有效低粉爆款",
            coverUrl: null,
            durationMs: 10_000,
            authorId: "author-1",
            authorName: "博主甲",
            followerCount: 500,
            playCount: 20_000,
            likeCount: 2_000,
            commentCount: 20,
            collectCount: null,
            shareCount: 10,
            publishTime: Math.floor(Date.parse("2026-07-23T11:00:00Z") / 1000),
            officialRank: 1,
            officialScore: 99,
          },
          {
            itemId: "unknown-fans",
            itemUrl: "https://www.douyin.com/video/unknown-fans",
            title: "粉丝未知",
            coverUrl: null,
            durationMs: 10_000,
            authorId: null,
            authorName: null,
            followerCount: null,
            playCount: 20_000,
            likeCount: 9_000,
            commentCount: null,
            collectCount: null,
            shareCount: null,
            publishTime: Math.floor(Date.parse("2026-07-23T11:00:00Z") / 1000),
            officialRank: 2,
            officialScore: 98,
          },
        ],
        };
      },
    });
    const result = await adapter.run(ctx, {
      source: {
        ...baseSource,
        type: "darkhorse_query",
        platform: "douyin",
        canonicalUrl: null,
      },
      config: {
        type: "darkhorse_query",
        collectorAccountId: "account-observer",
        keyword: "AI 写作",
        board: "low_follower_breakout",
      },
      extractionInstruction: null,
      checkpoint: null,
    });

    expect(result.items.map((item) => item.externalId)).toEqual(["hit"]);
    expect(usedCollector).toBe("account-observer");
    expect(result.safeDiagnostics).toMatchObject({
      boardReturnedCount: 2,
      matchedCount: 1,
      strongCount: 1,
    });
  });
});
