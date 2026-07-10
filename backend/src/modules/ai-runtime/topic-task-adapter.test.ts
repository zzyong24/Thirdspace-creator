import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// [T-182c] topic.generate 的 trend 出题依据接线测试:验证 basis="trend" 时组合根注入的
// trendSearch 端口(复用 T-126 联网检索)被调用,其命中被拼进 basisBrief 真喂给 runTopicTask;
// 端口未绑 / 检索抛错时诚实降级为空 brief 但不崩(仍走节点,靠 basis 参数当降级 hint)。
// mock ai-worker(动态 import 目标)的 modelFor + runTopicTask,只观察装配后的入参。
const runTopicTask = vi.fn(async (_input: { basisBrief?: string }) => undefined);
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runTopicTask,
}));

import {
  runTopicGenerateV2,
  buildTrendQuery,
  formatTrendBrief,
  type TopicTaskAdapterDeps,
  type TrendHit,
} from "./topic-task-adapter";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(
  trendSearch?: TopicTaskAdapterDeps["trendSearch"],
): TopicTaskAdapterDeps {
  return {
    ai: {
      markRunning: vi.fn(async () => undefined),
      recordStep: vi.fn(async () => undefined),
      recordCandidate: vi.fn(async () => undefined),
      cancelTask: vi.fn(async () => undefined),
    } as never,
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    } as never,
    resolveModelSpec: vi.fn(async () => ({
      apiFormat: "anthropic" as const,
      baseUrl: null,
      model: "claude-opus-4-8",
      token: "k",
    })),
    trendSearch,
  };
}

describe("buildTrendQuery", () => {
  it("贴定位领域,空白归一 + 截断", () => {
    expect(buildTrendQuery("  硬核 AI  创作者  ")).toBe(
      "硬核 AI 创作者 最新热点 趋势",
    );
  });
  it("无定位 → 通用 query,不产出空串", () => {
    expect(buildTrendQuery("")).toBe("内容创作 最新热点 趋势");
    expect(buildTrendQuery(undefined as unknown as string)).toBe(
      "内容创作 最新热点 趋势",
    );
  });
});

describe("formatTrendBrief", () => {
  it("非空命中 → 带段头的编号列表(title —— snippet)", () => {
    const hits: TrendHit[] = [
      { title: "热点一", snippet: "摘要一" },
      { title: "热点二" },
    ];
    const brief = formatTrendBrief(hits);
    expect(brief).toContain("当前热点");
    expect(brief).toContain("1. 热点一 —— 摘要一");
    expect(brief).toContain("2. 热点二");
  });
  it("空数组 / 全空 title → 空串(诚实降级)", () => {
    expect(formatTrendBrief([])).toBe("");
    expect(formatTrendBrief([{ title: "  " }])).toBe("");
  });
});

describe("runTopicGenerateV2 (trend basis 联网检索接线)", () => {
  beforeEach(() => {
    runTopicTask.mockClear();
  });
  it("basis=trend + trendSearch 有命中 → basisBrief 非空,真喂给 runTopicTask", async () => {
    const trendSearch = vi.fn(
      async (_c: RequestContext, _query: string, _opts?: { count?: number }) => [
        { title: "AI Agent 爆发", snippet: "多个框架发布" },
      ],
    );
    const deps = makeDeps(trendSearch);
    await runTopicGenerateV2(ctx, { id: "t1", inputData: { basis: "trend" } }, deps);

    expect(trendSearch).toHaveBeenCalledTimes(1);
    // query 由定位派生(本测试 positioning 空 → 通用 query)。
    expect(trendSearch.mock.calls[0]![1]).toBe("内容创作 最新热点 趋势");
    expect(runTopicTask).toHaveBeenCalledTimes(1);
    const arg = runTopicTask.mock.calls[0]![0] as { basisBrief?: string; basis?: string };
    expect(arg.basis).toBe("trend");
    expect(arg.basisBrief).toContain("AI Agent 爆发");
  });

  it("basis=trend + trendSearch 抛错 → basisBrief 空,但仍跑节点(不崩、不 cancel)", async () => {
    const trendSearch = vi.fn(async () => {
      throw new Error("web.search 未配");
    });
    const deps = makeDeps(trendSearch);
    await runTopicGenerateV2(ctx, { id: "t2", inputData: { basis: "trend" } }, deps);

    expect(runTopicTask).toHaveBeenCalled();
    const arg = runTopicTask.mock.calls.at(-1)![0] as { basisBrief?: string };
    expect(arg.basisBrief).toBe("");
    expect((deps.ai as unknown as { cancelTask: ReturnType<typeof vi.fn> }).cancelTask).not.toHaveBeenCalled();
  });

  it("basis=trend + 未绑 trendSearch 端口 → basisBrief 空降级,不崩", async () => {
    const deps = makeDeps(undefined);
    await runTopicGenerateV2(ctx, { id: "t3", inputData: { basis: "trend" } }, deps);
    expect(runTopicTask).toHaveBeenCalled();
    const arg = runTopicTask.mock.calls.at(-1)![0] as { basisBrief?: string };
    expect(arg.basisBrief).toBe("");
  });
});
