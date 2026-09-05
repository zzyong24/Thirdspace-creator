import { expect, it, vi } from "vitest";
import { preparePlanningThesisContext } from "./planning-thesis-context";
const ctx = {
  userId: "u",
  accountId: "a",
  requestId: "test",
  source: "user" as const,
};
const deps = () => ({
  positioning: {
    getPositioningCenter: vi.fn(async () => ({
      profile: {
        persona: "真实创作者",
        field: "科技",
        audience: "读者",
        differentiation: "实测",
        capabilities: [],
      },
      currentStatement: null,
    })),
  },
  learnings: {
    getSuggestions: async () => [{ title: "真实复盘", insight: "少说空话" }],
  },
  brief: {
    getBriefDetail: async () => ({
      coreMessage: "必须保留的核心信息",
      contentGoal: "明确内容目标",
    }),
  },
  projectMaterials: {
    listProjectMaterials: async () => [
      {
        name: "用户一手材料",
        priority: "high" as const,
        materialSummary: { keyPoints: ["18 阶段流程"], facts: [] },
      },
      {
        name: "AI参考",
        priority: "normal" as const,
        materialSummary: { keyPoints: ["参考内容"], facts: [] },
      },
    ],
  },
  knowledge: {
    list: async () => [{ title: "知识佐证", knowledgeType: "evidence" }],
  },
});
it("真实creativeContext保留旧全部facets与7个按原顺序grounding来源", async () => {
  const prepared = await preparePlanningThesisContext(
    ctx,
    { projectId: "p", inputData: { topic: "真实选题" } },
    deps(),
  );
  expect(Object.keys(prepared.facets).sort()).toEqual(
    [
      "positioning",
      "projectBriefHard",
      "benchmarkRef",
      "learnings",
      "userMaterialHard",
      "userMaterialRef",
      "topic",
    ].sort(),
  );
  expect(prepared.facets.positioning).toContain("真实创作者");
  expect(prepared.facets.projectBriefHard).toContain("必须保留的核心信息");
  expect(prepared.facets.learnings).toContain("少说空话");
  expect(prepared.facets.userMaterialHard).toContain("18 阶段流程");
  expect(prepared.facets.topic).toContain("真实选题");
  expect(prepared.grounding).toHaveLength(7);
  expect(prepared.grounding[0]).toBe(prepared.facets.positioning);
  expect(prepared.grounding[1]).toContain("必须保留的核心信息");
  expect(prepared.grounding[2]).toContain("18 阶段流程");
  expect(prepared.grounding[3]).toContain("参考内容");
  expect(prepared.grounding[4]).toContain("知识佐证");
  expect(prepared.grounding[5]).toBe("真实选题");
  expect(prepared.grounding[6]).toBe("");
});
it("缺project立即拒绝；可选定位失败仍保留旧通用空值降级", async () => {
  const d = deps();
  await expect(
    preparePlanningThesisContext(ctx, { projectId: null, inputData: {} }, d),
  ).rejects.toThrow("projectId");
  expect(d.positioning.getPositioningCenter).not.toHaveBeenCalled();
  d.positioning.getPositioningCenter.mockRejectedValue(new Error("offline"));
  const prepared = await preparePlanningThesisContext(
    ctx,
    { projectId: "p", inputData: {} },
    d,
  );
  expect(prepared.facets.positioning).toContain("尚未设置定位");
  expect(prepared.grounding[0]).toBe("");
});
