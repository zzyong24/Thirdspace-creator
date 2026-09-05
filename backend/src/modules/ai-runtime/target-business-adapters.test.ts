import { expect, it, vi } from "vitest";
import {
  createTopicEnrichBusinessAdapter,
  createMaterialMatchBusinessAdapter,
} from "./target-business-adapters";
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
  skills: [],
};
const task = {
  id: "t",
  retryOfTaskId: null,
  projectId: "p",
  inputData: { candidateId: "c", topic: "真主题", outputId: "o" },
  skillSnapshot,
};
function frozen(skillId: string, facets: Record<string, string | undefined>) {
  return {
    frozenInput: {
      kind: "model.structured",
      operationKey: skillId,
      skillId,
      capability: skillId,
      maxOutputTokens: 100,
      skillSnapshot: {
        ...skillSnapshot,
        skills: [
          {
            skillId,
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
      facets,
    },
  };
}
it("选题先验目标归属；投影只能使用冻结目标，保留原归一规则", async () => {
  const get = vi.fn(async () => ({ title: "真标题", angle: "真角度" }));
  const adapter = createTopicEnrichBusinessAdapter({
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    },
    candidate: { get },
  });
  const facets = await adapter.prepare(ctx, task);
  expect(get).toHaveBeenCalledExactlyOnceWith(ctx, "c");
  expect(facets.title).toBe("真标题");
  const result = adapter.project(
    { candidateId: "伪目标" },
    { oneLiner: " 卡片 ", candidateId: "模型伪目标", audiencePainScore: 12.6 },
    frozen("topic.enrich", facets),
  );
  expect(result).toMatchObject({
    resultType: "topic_card",
    resultData: {
      candidateId: "c",
      card: { oneLiner: "卡片", audiencePainScore: 13 },
    },
  });
  expect(() =>
    adapter.project({}, {}, frozen("topic.enrich", facets)),
  ).toThrow();
  get.mockRejectedValue(new Error("归属错误"));
  await expect(adapter.prepare(ctx, task)).rejects.toThrow("归属错误");
});
it("素材匹配先验项目，真实素材列表只读一次并冻结，模型不能伪造资产", async () => {
  const assertProject = vi.fn(async () => {});
  const list = vi.fn(async () => {
    expect(assertProject).toHaveBeenCalledExactlyOnceWith(ctx, "p");
    return [{ id: "asset", name: "真素材", type: "image" }];
  });
  const adapter = createMaterialMatchBusinessAdapter({
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    },
    assertProject,
    assets: { list },
  });
  const facets = await adapter.prepare(ctx, task);
  expect(list).toHaveBeenCalledOnce();
  expect(facets.library).toContain("asset | 真素材 (image)");
  const result = adapter.project(
    { outputId: "伪目标" },
    {
      matches: [
        { assetId: " asset ", role: "broll", reason: "真理由" },
        { assetId: "假的", role: "cover" },
      ],
    },
    frozen("material.match", facets),
  );
  expect(result).toMatchObject({
    resultType: "material_link_list",
    resultData: {
      outputId: "o",
      matches: [{ assetId: "asset", role: "broll", reason: "真理由" }],
    },
  });
  expect(() =>
    adapter.project(
      {},
      { matches: [{ assetId: "假的" }] },
      frozen("material.match", facets),
    ),
  ).toThrow();
  await expect(
    adapter.prepare(ctx, { ...task, projectId: null }),
  ).rejects.toThrow("项目");
  expect(list).toHaveBeenCalledOnce();
});
it("素材列表读取失败保留诚实空上下文，不能产生模型虚构资产候选", async () => {
  const adapter = createMaterialMatchBusinessAdapter({
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    },
    assertProject: async () => {},
    assets: {
      list: async () => {
        throw new Error("不可用");
      },
    },
  });
  const facets = await adapter.prepare(ctx, task);
  expect(facets.library).toContain("素材库为空");
  expect(() =>
    adapter.project(
      {},
      { matches: [{ assetId: "x" }] },
      frozen("material.match", facets),
    ),
  ).toThrow();
});
