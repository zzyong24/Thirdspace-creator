import { expect, it, vi } from "vitest";
import { createPlanningThesisBusinessAdapter } from "./planning-thesis-business-adapter";
const ctx = {
  userId: "u",
  accountId: "a",
  requestId: "test",
  source: "user" as const,
};
const skillSnapshot = {
  snapshotVersion: 1 as const,
  userId: "u",
  accountId: "a",
  resolvedAt: "now",
  platformPolicyVersion: "1",
  platformPolicy: "候选",
  skills: [
    {
      skillId: "planning.thesis",
      baseVersion: "1",
      overlayRevision: null,
      overlayVersion: null,
      effective: {
        methodSystem: "",
        template: "",
        tools: [],
        requiredFacets: [],
        contextRequirements: [],
        outputSchema: { type: "object" },
        completionPolicy: null,
        completionPolicyAdapter: null,
      },
    },
  ],
};
const task = {
  id: "task",
  retryOfTaskId: null,
  projectId: "p",
  inputData: {},
  skillSnapshot,
};
function fixture() {
  const assertProject = vi.fn(async () => {});
  const read = vi.fn(async () => {
    expect(assertProject).toHaveBeenCalledExactlyOnceWith(ctx, "p");
    return { profile: null, currentStatement: null };
  });
  return {
    assertProject,
    read,
    adapter: createPlanningThesisBusinessAdapter({
      assertProject,
      positioning: { getPositioningCenter: read },
    }),
  };
}
it("项目归属先于任何上下文读取，冻结7来源且不预建工件", async () => {
  const f = fixture();
  const facets = await f.adapter.prepare(ctx, task);
  expect(f.read).toHaveBeenCalledOnce();
  expect(JSON.parse(facets.__planningThesisGrounding!)).toEqual([
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  const frozenInput = {
    kind: "model.structured",
    operationKey: "planning.thesis",
    capability: "planning.thesis",
    maxOutputTokens: 1000,
    skillId: "planning.thesis",
    skillSnapshot,
    facets,
  };
  const candidate = f.adapter.project(
    {},
    {
      core: { title: "  核心  ", summary: "完整论点" },
      branches: [{ column: "support", title: "论据", summary: "正文" }],
    },
    { frozenInput },
  );
  expect(candidate).toMatchObject({
    resultType: "artifact_version",
    artifactId: null,
    resultData: {
      summary: "AI 论点树草稿",
      nodes: [
        { column: "core", title: "核心", summary: "完整论点" },
        { column: "support", title: "论据", summary: "正文" },
      ],
    },
  });
  expect(candidate.resultData.contentData).toEqual({
    nodes: candidate.resultData.nodes,
  });
  expect(() =>
    f.adapter.project(
      {},
      { core: { title: "核心", summary: "正文" }, branches: [] },
      {
        frozenInput: {
          ...frozenInput,
          facets: { ...facets, __planningThesisGrounding: '["bad"]' },
        },
      },
    ),
  ).toThrow();
});
it("缺项目及跨账号归属拒绝不会吞成空上下文", async () => {
  const f = fixture();
  await expect(
    f.adapter.prepare(ctx, { ...task, projectId: null }),
  ).rejects.toThrow("所属项目");
  expect(f.assertProject).not.toHaveBeenCalled();
  f.assertProject.mockRejectedValue(new Error("项目不属于当前账号"));
  await expect(f.adapter.prepare(ctx, task)).rejects.toThrow("不属于当前账号");
  expect(f.read).not.toHaveBeenCalled();
});
