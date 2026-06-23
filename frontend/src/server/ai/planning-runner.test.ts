import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { runPlanningThesis } from "./planning-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function makeDeps(llmText: string) {
  const recordCandidate = vi.fn(async () => undefined);
  const llm = vi.fn(async () => ({ text: llmText }));
  return {
    deps: {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate,
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
      llm,
    },
    recordCandidate,
    llm,
  };
}

describe("runPlanningThesis with injected llm", () => {
  it("calls deps.llm with planning.thesis capability and records a candidate", async () => {
    const tree =
      '{"core":{"title":"核心","summary":"展开"},"branches":[{"column":"support","title":"s","summary":"x"}]}';
    const { deps, recordCandidate, llm } = makeDeps(tree);
    await runPlanningThesis(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(llm).toHaveBeenCalledWith(
      ctx,
      "planning.thesis",
      expect.any(String),
      expect.objectContaining({ schema: true }),
    );
    expect(recordCandidate).toHaveBeenCalledTimes(1);
  });
});
