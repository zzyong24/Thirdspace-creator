import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { runPlanningContract } from "./planning-contract-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(llmText: string) {
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
  const llm = vi.fn(async () => ({ text: llmText }));
  return {
    deps: {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate,
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
      llm,
    },
    recordCandidate,
    llm,
  };
}

describe("runPlanningContract with injected llm", () => {
  it("calls deps.llm with planning.contract capability and records an artifact_version candidate", async () => {
    const obj =
      '{"受众定位":"给一线产品经理","价值主张":"用真实案例拆解","核心节奏":"前3秒抛冲突","行动召唤":"关注追更"}';
    const { deps, recordCandidate, llm } = makeDeps(obj);
    await runPlanningContract(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(llm).toHaveBeenCalledWith(
      ctx,
      "planning.contract",
      expect.any(String),
      expect.objectContaining({ schema: true }),
    );
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
    const { deps, recordCandidate } = makeDeps("{}");
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

  it("cancels the task when the agent returns no parseable cards", async () => {
    const { deps, recordCandidate } = makeDeps("没有 JSON 的纯文本");
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
