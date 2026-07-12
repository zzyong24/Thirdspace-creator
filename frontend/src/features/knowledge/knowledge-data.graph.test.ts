/**
 * [T-260a] assembleGraph 装配层测试:knowledge-data 读侧一次 fan-out
 * (knowledge.list + relations.listAll + materialLinks.list + projects.list)
 * → 纯函数 buildKnowledgeGraphVm → VM.graph。验证:
 *  - 装配全真值(节点 = active 知识 + 被引用 project;边 = 语义边 + 引用边;
 *    usedCount/usedInPublished 战绩投影透传;项目标题缺失以 id 兜底);
 *  - 三个图读 op 缺任一 → graph 诚实置 null(交互岛不渲关系图);
 *  - 语义边/引用边读失败 → graph 诚实置 null(不画残图)。
 */

import { describe, expect, it } from "vitest";

import {
  buildKnowledgeDashboardViewModel,
  type KnowledgeDataClient,
} from "./knowledge-data";

function knowledgeItem(
  id: string,
  extra: Partial<{ usedCount: number; usedInPublished: boolean }> = {},
) {
  return {
    id,
    title: `条目 ${id}`,
    knowledgeType: "claim",
    status: "active",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    sourceType: "manual",
    sourceUrl: null,
    sourceNote: null,
    usedCount: extra.usedCount ?? 0,
    usedInPublished: extra.usedInPublished ?? false,
  };
}

// 基座读(collectRelations / fetchTags / assembleAtlas 用),不影响 graph 装配。
const BASE_READS = {
  listKnowledgeRelations: () => Promise.resolve([]),
  listTags: () => Promise.resolve([]),
  listEntitiesForTag: () => Promise.resolve([]),
};

describe("assembleGraph 装配 (T-260a)", () => {
  it("四路 fan-out → 全真值 GraphVm(节点/双类边/project 派生/战绩投影)", async () => {
    const client = {
      listKnowledge: () =>
        Promise.resolve([
          knowledgeItem("k-1", { usedCount: 2, usedInPublished: true }),
          knowledgeItem("k-2"),
        ]),
      ...BASE_READS,
      listAllKnowledgeRelations: () =>
        Promise.resolve([
          {
            sourceKnowledgeId: "k-2",
            targetKnowledgeId: "k-1",
            relationType: "supports",
            strength: 1,
            createdByType: "ai",
          },
        ]),
      listMaterialLinks: () =>
        Promise.resolve([
          {
            projectId: "p-1",
            entityType: "knowledge",
            entityId: "k-1",
            role: "reference",
            stage: "script",
            createdAt: "2026-07-01T00:00:00.000Z",
          },
        ]),
      listProjects: () => Promise.resolve([{ id: "p-1", title: "项目甲" }]),
    } as unknown as KnowledgeDataClient;

    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(vm.graph).not.toBeNull();
    const graph = vm.graph!;
    // stats 全真值。
    expect(graph.stats).toEqual({
      knowledgeNodes: 2,
      projectNodes: 1,
      relationEdges: 1,
      usageEdges: 1,
      isolatedCount: 0,
    });
    // 战绩投影透传到节点。
    const k1 = graph.nodes.find((n) => n.id === "k-1");
    expect(k1?.usedCount).toBe(2);
    expect(k1?.usedInPublished).toBe(true);
    // project 节点派生 + 标题。
    const proj = graph.nodes.find((n) => n.kind === "project");
    expect(proj).toMatchObject({ id: "project:p-1", title: "项目甲" });
    // 语义边带 createdByType='ai'(AI 建);引用边指向 project。
    const relation = graph.edges.find((e) => e.kind === "relation");
    expect(relation).toMatchObject({
      source: "k-2",
      target: "k-1",
      relationType: "supports",
      createdByType: "ai",
    });
    const usage = graph.edges.find((e) => e.kind === "usage");
    expect(usage).toMatchObject({ source: "k-1", target: "project:p-1" });
  });

  it("缺图读 op(旧 fake client)→ graph 诚实置 null(不渲关系图)", async () => {
    const client = {
      listKnowledge: () => Promise.resolve([knowledgeItem("k-1")]),
      ...BASE_READS,
    } as unknown as KnowledgeDataClient;
    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(vm.graph).toBeNull();
  });

  it("语义边读失败 → graph 诚实置 null(不画残图)", async () => {
    const client = {
      listKnowledge: () => Promise.resolve([knowledgeItem("k-1")]),
      ...BASE_READS,
      listAllKnowledgeRelations: () => Promise.reject(new Error("boom")),
      listMaterialLinks: () => Promise.resolve([]),
      listProjects: () => Promise.resolve([]),
    } as unknown as KnowledgeDataClient;
    const vm = await buildKnowledgeDashboardViewModel(client);
    expect(vm.graph).toBeNull();
  });
});
