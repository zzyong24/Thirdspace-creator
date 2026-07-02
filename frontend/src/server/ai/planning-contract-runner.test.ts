import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// 内容合同 runner 迁 runStructuredNode(T-025 跨模型健壮)后:mock ai-worker 的 runStructuredNode
// (动态 import 目标),它返回 { object }(已被 outputSchema 校验的键值对象)。验证 capability 解析、
// 候选记录、归一(四个固定合同槽 pickBody 按 title/id 取值)仍按约定产出。
const runStructuredNode = vi.fn(async () => ({ object: {} }));
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode,
  // T-040b:runner 改运行时 getTemplate(id) 取被覆盖后的 REGISTRY 对象;mock 回传带该 id 的对象。
  getTemplate: (id: string) => ({ id }),
}));

import { runPlanningContract } from "./planning-contract-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(contractObject: Record<string, unknown>) {
  runStructuredNode.mockResolvedValue({ object: contractObject } as never);
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
      // assembleCreativeContext reads getPositioningCenter (PositioningReader) +
      // getSuggestions (LearningsReader) + getThesisNodes (ThesisReader); all are wrapped
      // in try/catch and degrade to "" — these stubs return the real shapes.
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      } as never,
      learnings: { getSuggestions: async () => [] } as never,
      thesis: { getThesisNodes: async () => [] } as never,
      resolveModelSpec,
    },
    recordCandidate,
    resolveModelSpec,
  };
}

describe("runPlanningContract (runStructuredNode + 外置模板)", () => {
  it("resolves the planning.contract capability and records an artifact_version candidate", async () => {
    // 结构化对象(键值对,已被 record schema 校验):四个固定角度的承诺。
    const obj = {
      受众定位: "给一线产品经理",
      价值主张: "用真实案例拆解",
      核心节奏: "前3秒抛冲突",
      行动召唤: "关注追更",
    };
    const { deps, recordCandidate, resolveModelSpec } = makeDeps(obj);
    await runPlanningContract(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "planning.contract");
    expect(runStructuredNode).toHaveBeenCalledTimes(1);
    expect(recordCandidate).toHaveBeenCalledTimes(1);
    const input = recordCandidate.mock.calls[0]![2];
    expect(input.resultType).toBe("artifact_version");
    expect(input.artifactId).toBe("a1");
    // contentData.cards carries the four locked contract slots (writer↔reader contract).
    const cards = (input.resultData.contentData as { cards: unknown[] }).cards;
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBe(4);
    expect(input.resultData.body).toContain("受众定位");
  });

  it("cancels the task (no candidate) when artifactId is missing", async () => {
    const { deps, recordCandidate } = makeDeps({});
    const cancelTask = vi.fn(async () => undefined);
    (deps.ai as { cancelTask: unknown }).cancelTask = cancelTask;
    await runPlanningContract(
      ctx,
      { id: "t1", projectId: "p1", inputData: {} },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });

  it("cancels the task when the object normalizes to no cards", async () => {
    // 空对象 → 四槽 body 全空 → cards=[] → guard 触发 → cancelTask。
    const { deps, recordCandidate } = makeDeps({});
    const cancelTask = vi.fn(async () => undefined);
    (deps.ai as { cancelTask: unknown }).cancelTask = cancelTask;
    await runPlanningContract(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(recordCandidate).not.toHaveBeenCalled();
    expect(cancelTask).toHaveBeenCalledTimes(1);
  });
});
