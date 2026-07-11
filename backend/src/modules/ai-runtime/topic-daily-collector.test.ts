import { describe, it, expect, vi } from "vitest";
import {
  collectDailyTopics,
  DEFAULT_TOPIC_DAILY_LIMIT,
  type TopicDailyCollectorDeps,
  type DailyTopicItem,
} from "./topic-daily-collector";
import type { RequestContext } from "@creatoros/contract";

// [T-235a] 每天自动出题采集器 —— 纯逻辑单测(全 fake 注入,零成本,不碰真模型/真库):
//   ① 未配文本模型 → 诚实跳过(itemsNew=0 + message,不抛);
//   ② 防灌库:当天已建候选 ≥ 上限 → 跳过不调模型;剩余配额 < 产出数 → 只取 top(剩余);
//   ③ [T-212d] 护栏排序生效:avoid 硬偏好压分改变利用位次序 + 探索位保底(被压制的高原始分题仍入池);
//   ④ 诚实计数:itemsNew = 实际入池数(单条落库失败跳过不计)。

const ctx: RequestContext = {
  userId: "u1",
  requestId: "test",
  source: "ingestion",
  accountId: "acct-1",
};

const NOW = "2026-07-11T02:00:00.000Z";

function topic(partial: Partial<DailyTopicItem> & { title: string }): DailyTopicItem {
  return {
    angle: "",
    source: "trend",
    predictedScore: null,
    reason: "",
    ...partial,
  };
}

function makeDeps(overrides: {
  topics?: DailyTopicItem[];
  todayCount?: number;
  dailyLimit?: number;
  modelConfigured?: boolean;
  preferences?: Array<{
    keyword: string;
    direction: "avoid" | "prefer";
    weight: number;
    exampleCount: number;
    lastReinforcedAt: string;
  }>;
  createCandidate?: TopicDailyCollectorDeps["createCandidate"];
}): TopicDailyCollectorDeps & {
  created: Array<{ title: string; source: string }>;
  _generateTopics: ReturnType<typeof vi.fn>;
} {
  const created: Array<{ title: string; source: string }> = [];
  const _generateTopics = vi.fn(async () => overrides.topics ?? []);
  return {
    // ContextDeps:只装 positioning(空档降级);signals/knowledge/learnings 缺省 → 各 brief 空。
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: { oneLiner: "AI 工具实测", keywords: ["AI"] },
      }),
    },
    resolveModelSpec: async () => {
      if (overrides.modelConfigured === false) {
        throw new Error("LlmCredentialError: topic.generate 未配 model");
      }
      return {
        apiFormat: "openai_chat" as const,
        baseUrl: null,
        model: "fake",
        token: "t",
      };
    },
    generateTopics: _generateTopics,
    listActivePreferences: async () => overrides.preferences ?? [],
    countCandidatesCreatedToday: async () => overrides.todayCount ?? 0,
    createCandidate:
      overrides.createCandidate ??
      (async (_c, input) => {
        created.push({ title: input.title, source: input.source });
        return { id: `cand-${created.length}` };
      }),
    now: () => NOW,
    dailyLimit: overrides.dailyLimit,
    created,
    _generateTopics,
  };
}

describe("collectDailyTopics (T-235a)", () => {
  it("① 未配文本模型 → 诚实跳过(itemsNew=0 + message,不抛、不调出题节点)", async () => {
    const deps = makeDeps({ modelConfigured: false });
    const res = await collectDailyTopics(ctx, deps);
    expect(res.itemsNew).toBe(0);
    expect(res.itemsUpdated).toBe(0);
    expect(res.message).toContain("未配文本模型");
    expect(deps._generateTopics).not.toHaveBeenCalled();
    expect(deps.created).toEqual([]);
  });

  it("② 防灌库:当天已建候选 ≥ 上限(默认 5)→ 跳过,不调模型不入池", async () => {
    const deps = makeDeps({ todayCount: DEFAULT_TOPIC_DAILY_LIMIT });
    const res = await collectDailyTopics(ctx, deps);
    expect(res.itemsNew).toBe(0);
    expect(res.message).toContain("防灌库上限");
    expect(deps._generateTopics).not.toHaveBeenCalled();
  });

  it("② 防灌库:剩余配额 < 产出数 → 只取护栏排序 top(剩余)入池", async () => {
    // 上限 5,已产 3 → 剩余 2;节点产 4 条 → 只入池 2 条。
    const deps = makeDeps({
      todayCount: 3,
      topics: [
        topic({ title: "A", predictedScore: 90 }),
        topic({ title: "B", predictedScore: 80 }),
        topic({ title: "C", predictedScore: 70 }),
        topic({ title: "D", predictedScore: 60 }),
      ],
    });
    const res = await collectDailyTopics(ctx, deps);
    expect(res.itemsNew).toBe(2);
    expect(deps.created).toHaveLength(2);
    // 无偏好 → adjusted=base,利用位取最高分 A;探索位 1 从剩余按 baseScore 补 B。
    expect(deps.created.map((c) => c.title)).toEqual(["A", "B"]);
  });

  it("③ [T-212d] 护栏排序生效:avoid 硬偏好压分改变利用位,探索位保底被压制的高分题", async () => {
    // 「减肥」题原始分最高(90)但被 avoid 硬偏好压 10 → adjusted 80,低于「工具」85。
    // limit=3、探索位 1 → 利用位 2 条按 adjusted(工具 85 > 减肥 80),探索位按 baseScore 补
    // 剩余最高原始分者 —— 验证被偏好压制的题不至于全灭(此处三条全入,重点验**次序**与保底语义)。
    const deps = makeDeps({
      dailyLimit: 3,
      preferences: [
        {
          keyword: "减肥",
          direction: "avoid",
          weight: 10,
          exampleCount: 3, // ≥3 例 = 硬偏好,注入评分
          lastReinforcedAt: NOW, // 无衰减
        },
      ],
      topics: [
        topic({ title: "减肥神器实测", predictedScore: 90 }),
        topic({ title: "工具效率翻倍", predictedScore: 85 }),
        topic({ title: "职场沟通课", predictedScore: 60 }),
      ],
    });
    const res = await collectDailyTopics(ctx, deps);
    expect(res.itemsNew).toBe(3);
    // 利用位(limit-探索位=2)按 adjustedScore:工具 85 > 减肥 80(> 职场 60);
    // 探索位 1 从剩余按 baseScore 补:职场 60。
    expect(deps.created.map((c) => c.title)).toEqual([
      "工具效率翻倍",
      "减肥神器实测",
      "职场沟通课",
    ]);
  });

  it("③ 探索位保底:被 avoid 偏好压出利用位的高原始分题,经探索位仍入池", async () => {
    // limit=2(利用位 1 + 探索位 1)。「减肥」原始分 95 被压到 85,低于「工具」88 →
    // 利用位取「工具」;探索位按 baseScore(95)把「减肥」捞回 —— 防茧房保底语义。
    const deps = makeDeps({
      dailyLimit: 2,
      preferences: [
        {
          keyword: "减肥",
          direction: "avoid",
          weight: 10,
          exampleCount: 3,
          lastReinforcedAt: NOW,
        },
      ],
      topics: [
        topic({ title: "减肥神器实测", predictedScore: 95 }),
        topic({ title: "工具效率翻倍", predictedScore: 88 }),
        topic({ title: "职场沟通课", predictedScore: 50 }),
      ],
    });
    const res = await collectDailyTopics(ctx, deps);
    expect(res.itemsNew).toBe(2);
    expect(deps.created.map((c) => c.title)).toEqual([
      "工具效率翻倍",
      "减肥神器实测",
    ]);
  });

  it("④ 诚实计数:单条入池失败跳过不崩,itemsNew 只计真入池数;source 透传真实渠道", async () => {
    let call = 0;
    const created: Array<{ title: string; source: string }> = [];
    const deps = makeDeps({
      topics: [
        topic({ title: "A", predictedScore: 90, source: "demand" }),
        topic({ title: "B", predictedScore: 80, source: "benchmark" }),
        topic({ title: "C", predictedScore: 70, source: "怪值" }), // 非法渠道归一 trend
      ],
      createCandidate: async (_c, input) => {
        call += 1;
        if (call === 2) throw new Error("db boom"); // 第 2 条落库失败
        created.push({ title: input.title, source: input.source });
        return { id: `cand-${call}` };
      },
    });
    const res = await collectDailyTopics(ctx, deps);
    expect(res.itemsNew).toBe(2); // 3 条排上,1 条失败 → 真入池 2
    expect(created.map((c) => c.source)).toEqual(["demand", "trend"]);
  });

  it("节点空产 → itemsNew=0 + 诚实 message(非失败)", async () => {
    const deps = makeDeps({ topics: [] });
    const res = await collectDailyTopics(ctx, deps);
    expect(res.itemsNew).toBe(0);
    expect(res.message).toContain("未产出选题");
  });

  it("出题节点抛错(模型运行时错)→ 上抛(runner 落诚实失败,不吞)", async () => {
    const deps = makeDeps({ topics: [] });
    deps._generateTopics.mockRejectedValueOnce(new Error("model boom"));
    await expect(collectDailyTopics(ctx, deps)).rejects.toThrow("model boom");
  });

  it("trendSearch 失败 → 热点段空,出题照常(诚实降级)", async () => {
    const deps = makeDeps({ topics: [topic({ title: "A", predictedScore: 70 })] });
    deps.trendSearch = vi.fn(async () => {
      throw new Error("SearchConfigError: web.search 未配");
    });
    const res = await collectDailyTopics(ctx, deps);
    expect(res.itemsNew).toBe(1);
    // 传给出题节点的 basisBrief 不含热点段(空降级)。
    const input = deps._generateTopics.mock.calls[0]![1] as { basisBrief: string };
    expect(input.basisBrief).not.toContain("当前热点");
  });
});
