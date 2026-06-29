import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { runPlanningOutline } from "./planning-outline-runner";

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
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      } as never,
      learnings: { getSuggestions: async () => [] } as never,
      thesis: { getThesisNodes: async () => [] } as never,
      contract: { getContractCards: async () => [] } as never,
      llm,
    },
    recordCandidate,
    llm,
  };
}

describe("runPlanningOutline with injected llm", () => {
  it("calls deps.llm with planning.outline capability and records an artifact_version candidate", async () => {
    const obj =
      '{"structureType":"问题-解决","opening":"前3秒抛冲突","sections":[{"label":"钩子","intent":"抓注意"},{"label":"价值","intent":"给干货"}],"ending":"金句收束","cta":"关注追更"}';
    const { deps, recordCandidate, llm } = makeDeps(obj);
    await runPlanningOutline(
      ctx,
      { id: "t1", projectId: "p1", inputData: { artifactId: "a1" } },
      deps,
    );
    expect(llm).toHaveBeenCalledWith(
      ctx,
      "planning.outline",
      expect.any(String),
      expect.objectContaining({ schema: true }),
    );
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
    const { deps, recordCandidate } = makeDeps("{}");
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

  it("cancels the task when the agent returns no parseable outline", async () => {
    const { deps, recordCandidate } = makeDeps("没有 JSON 的纯文本");
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
