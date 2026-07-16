import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type { TopicAttributionOutput } from "@creatoros/ai-worker";
import {
  runTopicAttribution,
  classifyPerformanceTier,
  attributionWorkBrief,
  experimentTitle,
  experimentAngle,
  type TopicAttributionDeps,
  type AttributableWork,
  type WorkMetrics,
} from "./topic-attribution-runner";

// [T-235d] 正向归因回流 runner 单测 —— 全 fake 注入(不碰真 AI、真库):
//   幂等 skip(已归因)/ 无稿跳过(T-224 诚实门)/ 无指标跳过 / 分层纯函数(相对基线)/
//   实验候选进池上限(≤3/run 防灌库,title 前缀「实验|」+ 归因引用)/ 未配模型诚实跳过 /
//   单条失败不崩整批。[gate-F1]:deps 面上根本没有 learnings 端口 —— 结构性零接触。

const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "user",
  accountId: "acc-1",
};

const AI_OUT: TopicAttributionOutput = {
  topic_type: "教程",
  hook_type: "具体数字",
  structure_formula: "三步教程",
  why_it_worked: "开头「3 个提示词技巧」直接给数字承诺",
  why_it_failed: "",
  reusable_formula: "数字承诺 + 三步拆解",
  next_experiments: [
    { title: "5 个进阶提示词", angle: "验证数字钩子可复用" },
    { title: "提示词避坑指南", angle: "验证反向角度" },
  ],
};

function makeWork(id: string, overrides?: Partial<AttributableWork>): AttributableWork {
  return { publicationId: id, projectId: `proj-${id}`, title: `作品 ${id}`, ...overrides };
}

const METRICS: WorkMetrics = {
  plays: 30000,
  likes: 900,
  raw: { views: 30000, likes: 900, finish_rate: 0.42 },
};

function makeDeps(
  overrides?: Partial<TopicAttributionDeps>,
): TopicAttributionDeps & {
  saved: Array<Record<string, unknown>>;
  candidates: Array<{ title: string; angle: string; attributionId: string }>;
} {
  const saved: Array<Record<string, unknown>> = [];
  const candidates: Array<{ title: string; angle: string; attributionId: string }> = [];
  let seq = 0;
  const deps: TopicAttributionDeps = {
    isModelConfigured: async () => true,
    listWorks: async () => [makeWork("pub-1")],
    hasAttribution: async () => false,
    getTranscript: async () => "大家好,今天讲 3 个提示词技巧……",
    getMetrics: async () => METRICS,
    getAccountBaseline: async () => ({ avgPlays: 10000, avgLikes: 300 }),
    getPositioningBrief: async () => "AI 编导定位",
    attribute: async () => AI_OUT,
    saveAttribution: async (_c, input) => {
      saved.push(input as unknown as Record<string, unknown>);
      return { id: `attr-${++seq}` };
    },
    createExperimentCandidate: async (_c, input) => {
      candidates.push(input);
      return { id: `cand-${candidates.length}` };
    },
    ...overrides,
  };
  return Object.assign(deps, { saved, candidates });
}

describe("classifyPerformanceTier(相对本账号基线,纯函数)", () => {
  const baseline = { avgPlays: 10000, avgLikes: 300 };

  it("播放 ≥3x 基线 → viral(默认阈值)", () => {
    const r = classifyPerformanceTier({ plays: 30000, likes: null }, baseline);
    expect(r).toEqual({ tier: "viral", ratio: 3 });
  });

  it("播放 ≤0.5x 基线 → low;其间 → normal", () => {
    expect(
      classifyPerformanceTier({ plays: 5000, likes: null }, baseline).tier,
    ).toBe("low");
    expect(
      classifyPerformanceTier({ plays: 15000, likes: null }, baseline).tier,
    ).toBe("normal");
  });

  it("播放缺失 → 回退赞相对平均赞", () => {
    const r = classifyPerformanceTier({ plays: null, likes: 1200 }, baseline);
    expect(r.tier).toBe("viral");
    expect(r.ratio).toBe(4);
  });

  it("无基线 / 基线为 0 → normal + ratio null(诚实中性,不编)", () => {
    expect(classifyPerformanceTier({ plays: 99999, likes: 9 }, null)).toEqual({
      tier: "normal",
      ratio: null,
    });
    expect(
      classifyPerformanceTier(
        { plays: 99999, likes: null },
        { avgPlays: 0, avgLikes: null },
      ),
    ).toEqual({ tier: "normal", ratio: null });
  });

  it("阈值配置化:自定义 viral/low 边界生效", () => {
    const t = { viralMultiple: 5, lowMultiple: 0.8 };
    expect(
      classifyPerformanceTier({ plays: 40000, likes: null }, baseline, t).tier,
    ).toBe("normal"); // 4x < 5x
    expect(
      classifyPerformanceTier({ plays: 7000, likes: null }, baseline, t).tier,
    ).toBe("low"); // 0.7x ≤ 0.8x
  });
});

describe("attributionWorkBrief(作品 brief 纯函数)", () => {
  it("含标题 + 分层 + 倍数 + 明细指标;views/plays 归一只出一次", () => {
    const brief = attributionWorkBrief("测试作品", "viral", 3.2, {
      plays: 32000,
      likes: 900,
      raw: { views: 32000, plays: 32000, likes: 900, finish_rate: 0.4 },
    });
    expect(brief).toContain("测试作品");
    expect(brief).toContain("爆款");
    expect(brief).toContain("3.2x");
    expect(brief).toContain("完播率：0.4");
    expect(brief.match(/播放：/g)).toHaveLength(1); // views/plays 归一
  });

  it("无基线 → 诚实注明「暂无基线」", () => {
    const brief = attributionWorkBrief("x", "normal", null, {
      plays: null,
      likes: null,
      raw: {},
    });
    expect(brief).toContain("暂无基线");
  });
});

describe("runTopicAttribution 编排", () => {
  it("未配文本模型 → 整轮诚实跳过(不调 AI、不落库)", async () => {
    const attribute = vi.fn();
    const deps = makeDeps({ isModelConfigured: async () => false, attribute });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(0);
    expect(result.message).toContain("未配文本模型");
    expect(attribute).not.toHaveBeenCalled();
    expect(deps.saved).toHaveLength(0);
  });

  it("幂等锚:已归因作品 skip(不重跑 AI)", async () => {
    const attribute = vi.fn(async () => AI_OUT);
    const deps = makeDeps({ hasAttribution: async () => true, attribute });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.skippedAttributed).toBe(1);
    expect(result.attributed).toBe(0);
    expect(attribute).not.toHaveBeenCalled();
  });

  it("无稿不产(T-224 诚实门):无逐字稿 / 无 projectId → 跳过 + 诚实计数", async () => {
    const attribute = vi.fn(async () => AI_OUT);
    const deps = makeDeps({
      listWorks: async () => [
        makeWork("pub-1"), // 有 projectId 但 getTranscript 返空
        makeWork("pub-2", { projectId: null }), // 无项目锚
      ],
      getTranscript: async () => "",
      attribute,
    });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.skippedNoTranscript).toBe(2);
    expect(result.attributed).toBe(0);
    expect(attribute).not.toHaveBeenCalled();
  });

  it("无指标快照 → 跳过(没新数据不归因)", async () => {
    const deps = makeDeps({ getMetrics: async () => null });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.skippedNoMetrics).toBe(1);
    expect(result.attributed).toBe(0);
  });

  it("正常归因:枚举字段 + 分层 + raw 溯源落库;实验候选带「实验|」前缀 + 归因引用", async () => {
    const deps = makeDeps();
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(1);
    expect(result.experimentsPromoted).toBe(2);
    const savedRow = deps.saved[0]!;
    expect(savedRow.topicType).toBe("教程");
    expect(savedRow.hookType).toBe("具体数字");
    expect(savedRow.structureFormula).toBe("三步教程");
    expect(savedRow.performanceTier).toBe("viral"); // 30000/10000 = 3x
    expect(savedRow.baselineRatio).toBe(3);
    expect(savedRow.publicationId).toBe("pub-1");
    expect(savedRow.projectId).toBe("proj-pub-1");
    // 实验候选:前缀 + card.attributionId 溯源 + angle 带归因引用。
    const cand = deps.candidates[0]!;
    expect(cand.title).toBe("实验|5 个进阶提示词");
    expect(cand.attributionId).toBe("attr-1");
    expect(cand.angle).toContain("正向归因回流");
    expect(cand.angle).toContain("attr-1");
    expect(cand.angle).toContain("验证数字钩子可复用");
  });

  it("实验候选进池上限:≤maxExperimentsPerRun/run(默认 3,跨作品全局防灌库)", async () => {
    const manyExperiments: TopicAttributionOutput = {
      ...AI_OUT,
      next_experiments: [
        { title: "实验A", angle: "" },
        { title: "实验B", angle: "" },
        { title: "实验C", angle: "" },
        { title: "实验D", angle: "" },
      ],
    };
    const deps = makeDeps({
      listWorks: async () => [makeWork("pub-1"), makeWork("pub-2")],
      attribute: async () => manyExperiments,
    });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(2);
    expect(result.experimentsPromoted).toBe(3); // 全局 ≤3,第二条作品的实验被封顶
    expect(deps.candidates).toHaveLength(3);
  });

  it("单轮作品上限:maxWorksPerRun 生效(默认 3)", async () => {
    const deps = makeDeps({
      listWorks: async () =>
        ["p1", "p2", "p3", "p4", "p5"].map((id) => makeWork(id)),
    });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(3);
  });

  it("单条失败(AI 抛)→ 跳过不崩整批,后续作品照常归因", async () => {
    let calls = 0;
    const deps = makeDeps({
      listWorks: async () => [makeWork("pub-bad"), makeWork("pub-good")],
      attribute: async () => {
        calls += 1;
        if (calls === 1) throw new Error("model boom");
        return AI_OUT;
      },
    });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(1);
    expect(deps.saved[0]!.publicationId).toBe("pub-good");
  });

  it("空 title 的实验不进池;基线/定位读失败降级不阻断归因", async () => {
    const deps = makeDeps({
      attribute: async () => ({
        ...AI_OUT,
        next_experiments: [{ title: "  ", angle: "x" }],
      }),
      getAccountBaseline: async () => {
        throw new Error("rollup boom");
      },
      getPositioningBrief: async () => {
        throw new Error("positioning boom");
      },
    });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(1);
    expect(result.experimentsPromoted).toBe(0);
    expect(deps.saved[0]!.performanceTier).toBe("normal"); // 无基线 → 诚实中性
    expect(deps.saved[0]!.baselineRatio).toBeNull();
  });
});

// [T-284b G2 / T-284c G3-A] 可复用公式回流成 learning + 真实数据背书 → 天然 grounded。
describe("可复用公式回流 learning(G2/G3-A)", () => {
  it("reusable_formula 非空 + 有逐字稿 + ≥N 真实指标 → createLearning(evidenceStrength=grounded)", async () => {
    const learnings: Array<{
      title: string;
      insight: string;
      learningType?: string;
      evidenceStrength: "grounded" | null;
    }> = [];
    const deps = makeDeps({
      createLearning: async (_c, input) => {
        learnings.push(input);
      },
    });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(1);
    expect(learnings).toHaveLength(1);
    // 标题 = reusable_formula 一句话;insight 带归因溯源尾注;attribution 天然 grounded。
    expect(learnings[0]!.title).toBe("数字承诺 + 三步拆解");
    expect(learnings[0]!.insight).toContain("attributionId=attr-1");
    expect(learnings[0]!.evidenceStrength).toBe("grounded");
    expect(learnings[0]!.learningType).toBe("conversion_pattern");
  });

  it("reusable_formula 为空 → 不产 learning(诚实,无据不回流)", async () => {
    const learnings: unknown[] = [];
    const deps = makeDeps({
      attribute: async () => ({ ...AI_OUT, reusable_formula: "  " }),
      createLearning: async (_c, input) => {
        learnings.push(input);
      },
    });
    await runTopicAttribution(ctx, deps);
    expect(learnings).toHaveLength(0);
  });

  it("真实指标条数 < N(阈值)→ 不给 grounded(留 candidate)", async () => {
    const learnings: Array<{ evidenceStrength: "grounded" | null }> = [];
    const deps = makeDeps({
      // 只有 1 条真实指标,阈值 N=2 → 不达标。
      getMetrics: async () => ({ plays: 30000, likes: null, raw: { views: 30000 } }),
      groundingMinMetrics: 2,
      createLearning: async (_c, input) => {
        learnings.push(input);
      },
    });
    await runTopicAttribution(ctx, deps);
    expect(learnings).toHaveLength(1);
    expect(learnings[0]!.evidenceStrength).toBeNull();
  });

  it("createLearning 失败 → 不崩批(归因仍落库)", async () => {
    const deps = makeDeps({
      createLearning: async () => {
        throw new Error("boom");
      },
    });
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(1); // 归因已落是真的
  });

  it("未绑 createLearning 端口 → 归因照常(不回流,best-effort)", async () => {
    const deps = makeDeps(); // 无 createLearning
    const result = await runTopicAttribution(ctx, deps);
    expect(result.attributed).toBe(1);
  });
});

describe("experimentTitle / experimentAngle 纯函数", () => {
  it("title 前缀「实验|」(T-235b 🔥跟拍| 同款先例)", () => {
    expect(experimentTitle(" 新题 ")).toBe("实验|新题");
  });

  it("angle 空时也带归因引用 provenance", () => {
    const a = experimentAngle("", {
      workTitle: "原作品",
      tier: "low",
      attributionId: "attr-9",
    });
    expect(a).toContain("原作品");
    expect(a).toContain("低表现");
    expect(a).toContain("attr-9");
  });
});
