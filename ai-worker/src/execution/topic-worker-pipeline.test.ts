import { beforeEach, describe, it, expect, vi } from "vitest";
import { GenerationFailure } from "./generation-error";
import type { TopicGenerateFrozen } from "./topic-worker-input";
const { node } = vi.hoisted(() => ({ node: vi.fn() }));
vi.mock("../nodes/structured-node", () => ({ runStructuredNode: node }));
vi.mock("../prompt/effective-skill-runtime", () => ({
  getEffectiveTemplate: (id: string) => ({ id }),
}));
import {
  runTopicWorkerPipeline,
  type TopicReadData,
  type TopicReadTarget,
} from "./topic-worker-pipeline";
const model = {} as never;
function input(
  basis: TopicGenerateFrozen["basis"] = "trend",
): TopicGenerateFrozen {
  return {
    version: 1,
    basis,
    projectId: null,
    context: {
      positioningBrief: "真实定位",
      knowledgeBrief: "真实知识",
      learningsBrief: "真实经验",
    },
    qualityNow: "2026-09-05T00:00:00.000Z",
    qualityInputs: { signals: [], positioning: null, knowledge: [] },
    qualityProfile: {
      comments: {
        count: 0,
        coveredWorks: 0,
        strongSignalRatio: 0,
        noiseRatio: 0,
      },
      positioning: {
        filledFacets: 0,
        totalFacets: 9,
        rulesFilled: 0,
        completeness: 0,
      },
      knowledge: { count: 0, recentRatio: null },
      trend: { sourceCount: 0, signalCount: 0 },
    },
    basisBrief: "冻结依据",
    trendSources: [],
  };
}
function deps(
  read: (target: TopicReadTarget) => Promise<TopicReadData | null> = vi.fn(
    async () => null,
  ),
  signal = new AbortController().signal,
) {
  return { model, signal, read, maxOutputTokens: 321, timeoutMs: 2000 };
}
beforeEach(() => {
  node.mockReset();
  node.mockImplementation(async (arg) => ({
    object: arg.outputSchema.parse({ topics: [{ title: "真实选题" }] }),
  }));
});
describe("topic Worker纯流水线（非fork）", () => {
  it.each(["positioning", "comments", "knowledge", "trend"] as const)(
    "依据%s仅最终一次模型，无额外planner",
    async (basis) => {
      const d = deps();
      await runTopicWorkerPipeline(input(basis), d);
      expect(node).toHaveBeenCalledTimes(1);
      expect(d.read).toHaveBeenCalledTimes(basis === "trend" ? 1 : 0);
      expect(node.mock.calls[0]![0]).toMatchObject({
        template: { id: "topic.generate" },
        model,
        maxOutputTokens: 321,
        timeoutMs: 2000,
        signal: d.signal,
      });
    },
  );
  it("搜索+网页正文+RSS原文经真实解析和提取进入最终依据，画像替换零值", async () => {
    const raw = input();
    raw.trendSources = [
      {
        id: "web",
        name: "网页源",
        url: "https://news.example/page",
        domain: "news.example",
        sourceType: "web",
      },
      {
        id: "rss",
        name: "RSS源",
        url: "https://rss.example/feed",
        domain: "rss.example",
        sourceType: "rss",
      },
    ];
    const read = vi.fn(
      async (target: {
        kind: string;
        sourceId?: string;
      }): Promise<TopicReadData> =>
        target.kind === "search"
          ? {
              kind: "search",
              results: [
                {
                  title: "真实搜索标题",
                  url: "https://search.example/story",
                  snippet: "真实搜索摘要",
                },
              ],
            }
          : target.sourceId === "web"
            ? {
                kind: "web",
                sourceUrl: "https://news.example/page",
                title: "网页标题",
                text: "原始网页全文，供真实抽取使用",
              }
            : {
                kind: "rss",
                sourceUrl: "https://rss.example/feed",
                title: "RSS",
                text: '<rss version="2.0"><channel><item><title>真实RSS标题</title><link>https://rss.example/story</link><description>RSS正文</description></item></channel></rss>',
              },
    );
    node.mockImplementation(async (arg) => ({
      object: arg.outputSchema.parse(
        arg.template.id === "trend.extract"
          ? {
              signals: [
                {
                  title: "网页抽取信号",
                  url: "https://news.example/story",
                  heat: null,
                  publishedAt: null,
                },
              ],
            }
          : { topics: [{ title: "最终选题" }] },
      ),
    }));
    await runTopicWorkerPipeline(raw, deps(read));
    expect(read.mock.calls.map((c) => c[0])).toEqual([
      { kind: "search" },
      { kind: "source", sourceId: "web" },
      { kind: "source", sourceId: "rss" },
    ]);
    expect(node).toHaveBeenCalledTimes(2);
    expect(node.mock.calls[0]![0].facets).toEqual({
      sourceName: "网页源",
      pageText: "原始网页全文，供真实抽取使用",
    });
    const facets = node.mock.calls[1]![0].facets;
    for (const value of [
      "真实搜索标题",
      "真实搜索摘要",
      "网页抽取信号",
      "真实RSS标题",
      "网页源",
      "RSS源",
    ])
      expect(facets.basisContext).toContain(value);
    expect(facets.signalQuality).toContain("3 条(来自 3 路信源)");
    expect(facets.knowledgeRef).toContain("真实知识");
    expect(facets.learningsConstraint).toContain("真实经验");
  });
  it("空源保留诚实热点降级并继续一次出题", async () => {
    const d = deps();
    await runTopicWorkerPipeline(input(), d);
    expect(node.mock.calls[0]![0].facets.signalQuality).toContain(
      "本次未拉到实时信号",
    );
    expect(node.mock.calls[0]![0].facets.basisContext).toBe("");
  });
  it.each([
    new GenerationFailure("unknown_result", "UNKNOWN"),
    new GenerationFailure("failed", "BUDGET_EXHAUSTED"),
    new GenerationFailure("waiting_user", "NEEDS_LOGIN"),
  ])("读取明确停止$ errorCode不再模型", async (error) => {
    const d = deps(
      vi.fn(async () => {
        throw error;
      }),
    );
    await expect(runTopicWorkerPipeline(input(), d)).rejects.toBe(error);
    expect(node).not.toHaveBeenCalled();
  });
  it.each([
    new GenerationFailure("unknown_result", "UNKNOWN"),
    new GenerationFailure("failed", "BUDGET_EXHAUSTED"),
    new GenerationFailure("waiting_user", "NEEDS_LOGIN"),
  ])("提取停止$errorCode不进入最终模型", async (error) => {
    const raw = input();
    raw.trendSources = [
      {
        id: "s",
        name: "源",
        url: "https://example.com",
        domain: "example.com",
        sourceType: "web",
      },
    ];
    node.mockRejectedValue(error);
    const d = deps(
      vi.fn(async () => ({
        kind: "web" as const,
        sourceUrl: "https://example.com",
        title: "源",
        text: "正文",
      })),
    );
    await expect(runTopicWorkerPipeline(raw, d)).rejects.toBe(error);
    expect(node).toHaveBeenCalledTimes(1);
  });
  it("已取消不可发出首次读取", async () => {
    const controller = new AbortController();
    controller.abort();
    const d = deps(undefined, controller.signal);
    await expect(runTopicWorkerPipeline(input(), d)).rejects.toThrow();
    expect(d.read).not.toHaveBeenCalled();
    expect(node).not.toHaveBeenCalled();
  });
  it("读取完成同时取消，不再抽取或最终生成", async () => {
    const controller = new AbortController();
    const d = deps(
      vi.fn(async () => {
        controller.abort();
        return null;
      }),
      controller.signal,
    );
    await expect(runTopicWorkerPipeline(input(), d)).rejects.toThrow();
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(node).not.toHaveBeenCalled();
  });
  it("已确认结构错误只跳过该源，普通未知异常不得降级", async () => {
    const raw = input();
    raw.trendSources = [
      {
        id: "s",
        name: "源",
        url: "https://example.com",
        domain: "example.com",
        sourceType: "web",
      },
    ];
    const read = vi.fn(async () => ({
      kind: "web" as const,
      sourceUrl: "https://example.com",
      title: "源",
      text: "正文",
    }));
    node.mockRejectedValueOnce(new Error("结构化节点: schema失败"));
    await runTopicWorkerPipeline(raw, deps(read));
    expect(node).toHaveBeenCalledTimes(2);
    node.mockReset();
    const error = new Error("transport lost");
    node.mockRejectedValue(error);
    await expect(runTopicWorkerPipeline(raw, deps(read))).rejects.toBe(error);
    expect(node).toHaveBeenCalledTimes(1);
  });
  it("最终空输出使用真实schema拒绝", async () => {
    node.mockImplementation(async (arg) => ({
      object: arg.outputSchema.parse({ topics: [] }),
    }));
    await expect(
      runTopicWorkerPipeline(input("positioning"), deps()),
    ).rejects.toThrow("至少返回一条");
    expect(node).toHaveBeenCalledTimes(1);
  });
});
