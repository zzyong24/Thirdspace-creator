import { describe, it, expect, vi } from "vitest";
import { createResearchGatherBusinessAdapter } from "./research-business-adapter";
const ctx = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user" as const,
};
const deps = {
  positioning: {
    getPositioningCenter: async () => ({
      profile: null,
      currentStatement: null,
    }),
  },
};
const task = (value: {
  projectId: string | null;
  inputData: Record<string, unknown>;
}) =>
  ({
    ...value,
    id: "t",
    retryOfTaskId: null,
    skillSnapshot: undefined,
  }) as never;
const categories = {
  hooks: [{ text: "方向", why: "用途" }],
  cases: [
    {
      title: "案例",
      source: "猜测",
      sourceUrl: "https://fake.example",
      opening: "开头",
    },
  ],
  dataPoints: [
    { stat: "方向性事实", source: "猜测", sourceUrl: "https://fake.example" },
  ],
  quotes: [{ line: "金句" }],
};
function execution(facets: Record<string, string | undefined>) {
  return {
    frozenInput: {
      kind: "model.structured",
      skillId: "research.gather",
      capability: "research.gather",
      facets,
      operationKey: "research.gather",
      maxOutputTokens: 100,
      skillSnapshot: {
        snapshotVersion: 1,
        userId: "u",
        accountId: "a",
        resolvedAt: "now",
        platformPolicyVersion: "1",
        platformPolicy: "候选",
        skills: [
          {
            skillId: "research.gather",
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
      },
    },
  } as never;
}
describe("research structured adapter", () => {
  it("冻结主题和真实降级来源，保留四类输出并清除模型伪来源", async () => {
    const adapter = createResearchGatherBusinessAdapter(deps as never);
    const facets = await adapter.prepare(
      ctx,
      task({
        projectId: null,
        inputData: { topic: "真实主题", angle: "真实角度" },
      }),
    );
    expect(facets.angle).toContain("真实角度");
    expect(facets.searchResults).toBe("");
    const result = adapter.project(
      { topic: "伪造" },
      categories,
      execution(facets),
    );
    expect(result.resultType).toBe("material_list");
    expect(result.resultData).toMatchObject({
      topic: "真实主题",
      grounding: "model_memory",
      categories: { cases: [{ source: "模型记忆,需核实", sourceUrl: "" }] },
    });
    expect((result.resultData.items as unknown[]).length).toBe(4);
  });
  it("项目存在必须先验证归属", async () => {
    await expect(
      createResearchGatherBusinessAdapter(deps as never).prepare(
        ctx,
        task({ projectId: "p", inputData: {} }),
      ),
    ).rejects.toThrow();
    const assertProject = vi.fn(async () => {
      throw new Error("归属拒绝");
    });
    await expect(
      createResearchGatherBusinessAdapter({
        ...deps,
        assertProject,
      } as never).prepare(ctx, task({ projectId: "p", inputData: {} })),
    ).rejects.toThrow("归属拒绝");
    expect(assertProject).toHaveBeenCalledWith(ctx, "p");
  });
  it("冻结元数据缺失或伪造联网来源拒绝", async () => {
    const a = createResearchGatherBusinessAdapter(deps as never);
    const f = await a.prepare(
      ctx,
      task({ projectId: null, inputData: { topic: "x" } }),
    );
    expect(() =>
      a.project(
        {},
        categories,
        execution({ ...f, __researchGather: undefined }),
      ),
    ).toThrow();
    expect(() =>
      a.project(
        {},
        categories,
        execution({
          ...f,
          __researchGather: JSON.stringify({
            topic: "x",
            projectId: null,
            grounding: "web",
          }),
        }),
      ),
    ).toThrow();
  });
  it("空结果和全伪引用不生成候选", async () => {
    const a = createResearchGatherBusinessAdapter(deps as never);
    const f = await a.prepare(
      ctx,
      task({ projectId: null, inputData: { topic: "x" } }),
    );
    expect(() =>
      a.project(
        {},
        { hooks: [], cases: [], dataPoints: [], quotes: [] },
        execution(f),
      ),
    ).toThrow("不能同时为空");
    expect(() =>
      a.project(
        {},
        {
          ...categories,
          hooks: [],
          cases: [],
          dataPoints: [],
          quotes: [{ line: "arXiv 2308.00352" }],
        },
        execution(f),
      ),
    ).toThrow("编造引用");
  });
});
