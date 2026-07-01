import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 论点树 runner 迁 runStructuredNode(T-025 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 的目标),它返回 { object }(已被 outputSchema 校验的结构化对象)。runner 解析 model
// (resolveModelSpec)→ runStructuredNode 拿 object → normalizeThesisTree + recordCandidate。
// 这里把 runStructuredNode 打桩成返回固定 object,验证:capability 被正确解析、候选被记录、
// 归一逻辑(论点树 nodes)仍按约定产出。
const runStructuredNode = vi.fn(async () => ({ object: {} }));
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode,
  PLANNING_THESIS_TEMPLATE: { id: "planning.thesis" },
}));

import { runPlanningThesis } from "./planning-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(treeObject: Record<string, unknown>) {
  runStructuredNode.mockResolvedValue({ object: treeObject } as never);
  const recordCandidate = vi.fn(
    async (
      _ctx: RequestContext,
      _taskId: string,
      _input: {
        resultType: string;
        artifactId?: string | null;
        resultData: Record<string, unknown>;
      },
    ) => undefined,
  );
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
        cancelTask: vi.fn(async () => undefined),
      } as never,
      // assembleCreativeContext reads getPositioningCenter (the PositioningReader port)
      // and getSuggestions (the LearningsReader port); both are wrapped in try/catch and
      // degrade to "" — these stubs return the real shapes so context assembles cleanly.
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
    resolveModelSpec,
  };
}

describe("runPlanningThesis (runStructuredNode + 外置模板)", () => {
  it("resolves the planning.thesis capability and records an artifact_version candidate", async () => {
    // 结构化对象(已被 outputSchema 校验):核心论点 + 一个支撑分支。
    const tree = {
      core: { title: "核心", summary: "展开" },
      branches: [{ column: "support", title: "s", summary: "x" }],
    };
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(tree);
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "planning.thesis");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("artifact_version");
    expect(input.artifactId).toBe("a1");
    // contentData.nodes carries the core + branch nodes (writer↔reader contract).
    const nodes = (input.resultData.contentData as { nodes: unknown[] }).nodes;
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBe(2);
  });

  it("cancels the task (no candidate) when the object normalizes to no nodes", async () => {
    // 合法但空的结构化对象 → normalizeThesisTree 产 0 节点 → guard 触发 → cancelTask。
    const { deps, recordCandidate } = makeDeps({
      core: { title: "", summary: "" },
      branches: [],
    });
    const cancelTask = vi.fn(async () => undefined);
    (deps.ai as { cancelTask: unknown }).cancelTask = cancelTask;
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});
