import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 论点树 runner 迁 Vercel SDK 后:不再 mock deps.llm,改 mock ai-worker 的 runTemplatedNode
// (动态 import 的目标)。runner 解析 model(resolveModelSpec)→ runTemplatedNode 拿 text →
// 前端 parse + recordCandidate。这里把 runTemplatedNode 打桩成返回固定 text,验证:capability
// 被正确解析、候选被记录、parse 逻辑(论点树 nodes)仍按约定产出。
const runTemplatedNode = vi.fn(async () => ({ text: "", steps: [] }));
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runTemplatedNode,
  PLANNING_THESIS_TEMPLATE: { id: "planning.thesis" },
}));

import { runPlanningThesis } from "./planning-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(llmText: string) {
  runTemplatedNode.mockResolvedValue({ text: llmText, steps: [] } as never);
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

describe("runPlanningThesis (Vercel SDK + 外置模板)", () => {
  it("resolves the planning.thesis capability and records an artifact_version candidate", async () => {
    const tree =
      '{"core":{"title":"核心","summary":"展开"},"branches":[{"column":"support","title":"s","summary":"x"}]}';
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(tree);
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "planning.thesis");
    expect(runTemplatedNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("artifact_version");
    expect(input.artifactId).toBe("a1");
    // contentData.nodes carries the core + branch nodes (writer↔reader contract).
    const nodes = (input.resultData.contentData as { nodes: unknown[] }).nodes;
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBe(2);
  });

  it("cancels the task (no candidate) when the agent returns no parseable nodes", async () => {
    const { deps, recordCandidate } = makeDeps("没有 JSON 的纯文本");
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
