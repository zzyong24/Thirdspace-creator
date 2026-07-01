import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 结构方案 runner 迁 runStructuredNode(T-025 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 目标),它返回 { object }(已被 outputSchema 校验的结构化对象)。验证 capability 解析、
// 候选记录、归一(structureType + sections)仍按约定产出。
const runStructuredNode = vi.fn(async () => ({ object: {} }));
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode,
  PLANNING_OUTLINE_TEMPLATE: { id: "planning.outline" },
}));

import { runPlanningOutline } from "./planning-outline-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(outlineObject: Record<string, unknown>) {
  runStructuredNode.mockResolvedValue({ object: outlineObject } as never);
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
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      } as never,
      learnings: { getSuggestions: async () => [] } as never,
      thesis: { getThesisNodes: async () => [] } as never,
      contract: { getContractCards: async () => [] } as never,
      resolveModelSpec,
    },
    recordCandidate,
    resolveModelSpec,
  };
}

describe("runPlanningOutline (runStructuredNode + 外置模板)", () => {
  it("resolves the planning.outline capability and records an artifact_version candidate", async () => {
    // 结构化对象(已被 outputSchema 校验):结构类型 + 两段。
    const obj = {
      structureType: "问题-解决",
      opening: "前3秒抛冲突",
      sections: [
        { label: "钩子", intent: "抓注意" },
        { label: "价值", intent: "给干货" },
      ],
      ending: "金句收束",
      cta: "关注追更",
    };
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(obj);
    await runPlanningOutline(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "planning.outline");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("artifact_version");
    expect(input.artifactId).toBe("a1");
    const cd = input.resultData.contentData as {
      structureType: string;
      sections: unknown[];
    };
    expect(cd.structureType).toBe("问题-解决");
    expect(cd.sections.length).toBe(2);
    expect(input.resultData.body).toContain("结构方案");
  });

  it("cancels the task (no candidate) when artifactId is missing", async () => {
    const { deps, recordCandidate } = makeDeps({});
    const cancelTask = vi.fn(async () => undefined);
    (deps.ai as { cancelTask: unknown }).cancelTask = cancelTask;
    await runPlanningOutline(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("cancels the task when the object normalizes to no outline", async () => {
    // 空对象 → structureType 空 + sections 空 → guard 触发 → cancelTask。
    const { deps, recordCandidate } = makeDeps({});
    const cancelTask = vi.fn(async () => undefined);
    (deps.ai as { cancelTask: unknown }).cancelTask = cancelTask;
    await runPlanningOutline(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});
