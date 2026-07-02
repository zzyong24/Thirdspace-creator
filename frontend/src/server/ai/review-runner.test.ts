import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 复盘 runner 迁 runStructuredNode(T-025 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 的目标),它返回 { object }(已被 outputSchema 校验的结构化对象,顶层 { learnings:[...] })。
// runner 解析 model(resolveModelSpec)→ runStructuredNode 拿 object → normalizeLearnings +
// recordCandidate。这里把 runStructuredNode 打桩成返回固定 object,验证:capability 被正确解析、
// 候选被记录、归一逻辑(经验列表)仍按约定产出。
const runStructuredNode = vi.fn(async () => ({ object: { learnings: [] } }));
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode,
  // T-040b:runner 改运行时 getTemplate(id) 取被覆盖后的 REGISTRY 对象;mock 回传带该 id 的对象。
  getTemplate: (id: string) => ({ id }),
}));

import { runReviewAnalyze, reviewFacets } from "./review-runner";
import type { CreativeContext } from "./creative-context";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

// 一个最小 CreativeContext,只填复盘 facet 映射关心的字段,其余空(不影响 reviewFacets 断言)。
function makeContext(over: Partial<CreativeContext> = {}): CreativeContext {
  return {
    positioningBrief: "",
    learningsBrief: "",
    assetsBrief: "",
    accountsBrief: "",
    signalsBrief: "",
    knowledgeBrief: "",
    thesisBrief: "",
    contractBrief: "",
    outlineBrief: "",
    orientationHint: "",
    reviewTitle: "",
    reviewScript: "",
    reviewMetrics: "",
    reviewComments: "",
    topic: { title: "", angle: "" },
    projectId: null,
    ...over,
  };
}

function makeDeps(object: Record<string, unknown>) {
  runStructuredNode.mockResolvedValue({ object } as never);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        resultData: Record<string, unknown>;
      },
    ) => undefined,
  );
  const cancelTask = vi.fn(async () => undefined);
  const resolveModelSpec = vi.fn(async () => ({
    apiFormat: "anthropic" as const,
    baseUrl: null,
    model: "claude-opus-4-8",
    token: "k",
  }));
  return {
    deps: {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate,
        recordStep: vi.fn(async () => undefined),
        cancelTask,
      } as never,
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      } as never,
      learnings: { getSuggestions: async () => [] } as never,
      resolveModelSpec,
    },
    recordCandidate,
    cancelTask,
    resolveModelSpec,
  };
}

describe("runReviewAnalyze (runStructuredNode + 外置模板)", () => {
  it("resolves review.insights and records a learning_list candidate", async () => {
    // 结构化对象(已被 outputSchema 校验):两条经验(一条缺 insight 也留)。
    const object = {
      learnings: [
        { title: "前3秒用具体数字", insight: "承诺收益提升完播" },
        { title: "结尾强 CTA", insight: "" },
      ],
    };
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(object);
    await runReviewAnalyze(
      ctx,
      { id: "t1", projectId: "p1", inputData: { topic: "复盘对象" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "review.insights");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("learning_list");
    const items = input.resultData.items as unknown[];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(2);
  });

  it("cancels the task (no candidate) when the object normalizes to no learnings", async () => {
    // 合法但退化的结构化对象(缺 title)→ normalizeLearnings 产 0 项 → guard → cancel。
    const { deps, recordCandidate, cancelTask } = makeDeps({
      learnings: [{ title: "", insight: "无标题" }],
    });
    await runReviewAnalyze(
      ctx,
      { id: "t1", projectId: "p1", inputData: { topic: "复盘对象" } },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});

// ── T-039a:reviewFacets 真数据映射(subject=真标题 + 文案/数据/评论进 prompt 占位)──────────
describe("reviewFacets — 复盘作品真材料映射进 review.insights facets", () => {
  it("subject 用作品真标题;文案/数据/评论各拼成带标题行的整块", () => {
    const facets = reviewFacets(
      makeContext({
        reviewTitle: "上下文工程实战复盘",
        reviewScript: "开头三秒抛钩子……逐字稿正文",
        reviewMetrics: "播放：52000 · 点赞：3100 · 评论：420",
        reviewComments: "· 钩子太强\n· 求下集",
      }),
    );
    // subject = 真标题(不是账号级兜底)。
    expect(facets.subject).toBe("上下文工程实战复盘");
    // 三个块含真内容 + 各自的中文小标题(prompt 里会条件注入)。
    expect(facets.reviewScriptBlock).toContain("【本次复盘作品·文案】");
    expect(facets.reviewScriptBlock).toContain("逐字稿正文");
    expect(facets.reviewMetricsBlock).toContain("【本次复盘作品·真实数据】");
    expect(facets.reviewMetricsBlock).toContain("52000");
    expect(facets.reviewCommentsBlock).toContain("【本次复盘作品·观众评论】");
    expect(facets.reviewCommentsBlock).toContain("求下集");
  });

  it("overrideSubject(对话里显式指定)优先于 reviewTitle", () => {
    const facets = reviewFacets(
      makeContext({ reviewTitle: "作品真标题" }),
      "用户指定的复盘对象",
    );
    expect(facets.subject).toBe("用户指定的复盘对象");
  });

  it("无真标题也无 override → 回退账号级兜底文案(subject 非空,不触发 requiredFacet 报错)", () => {
    const facets = reviewFacets(makeContext());
    expect(facets.subject).toContain("按这个账号的整体表现");
  });

  it("空文案/数据/评论 → 对应块为空串(prompt 里该块省略,不硬塞空占位)", () => {
    const facets = reviewFacets(makeContext({ reviewTitle: "只有标题" }));
    expect(facets.reviewScriptBlock).toBe("");
    expect(facets.reviewMetricsBlock).toBe("");
    expect(facets.reviewCommentsBlock).toBe("");
  });
});
