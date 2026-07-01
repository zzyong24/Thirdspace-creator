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
  REVIEW_INSIGHTS_TEMPLATE: { id: "review.insights" },
}));

import { runReviewAnalyze } from "./review-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

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
