import { describe, it, expect } from "vitest";
import {
  buildKnowledgeGraphVm,
  type GraphSourceItem,
  type GraphSourceRelation,
  type GraphSourceMaterialLink,
} from "./knowledge-graph-vm";

// T-091 GraphVm 纯构建器单测:节点/双类边/project 派生/孤立计数/诚实过滤。

const items: GraphSourceItem[] = [
  { id: "k-1", title: "观点A", knowledgeType: "claim", status: "active", usedCount: 2, usedInPublished: true },
  { id: "k-2", title: "证据B", knowledgeType: "evidence", status: "active" },
  { id: "k-3", title: "孤立C", knowledgeType: "quote", status: "active" },
  { id: "k-4", title: "已归档D", knowledgeType: "note", status: "archived" },
];

const relations: GraphSourceRelation[] = [
  { sourceKnowledgeId: "k-2", targetKnowledgeId: "k-1", relationType: "supports", strength: 1, createdByType: "user" },
  // 指向 archived 的边该丢。
  { sourceKnowledgeId: "k-1", targetKnowledgeId: "k-4", relationType: "references", strength: 1, createdByType: "ai" },
];

const links: GraphSourceMaterialLink[] = [
  { projectId: "p-1", entityType: "knowledge", entityId: "k-1", role: "reference", stage: "script", createdAt: "2026-07-01T00:00:00.000Z" },
  // asset 引用不进知识图谱。
  { projectId: "p-1", entityType: "asset", entityId: "a-1", role: "broll", stage: "production", createdAt: "2026-07-01T00:00:00.000Z" },
  // 挂在 archived 知识上的引用该丢。
  { projectId: "p-2", entityType: "knowledge", entityId: "k-4", role: "reference", stage: "script", createdAt: "2026-07-01T00:00:00.000Z" },
];

describe("buildKnowledgeGraphVm", () => {
  it("节点 = active knowledge + 被引用 project;archived 不进图", () => {
    const vm = buildKnowledgeGraphVm(items, relations, links, [
      { id: "p-1", title: "本地记忆一期" },
    ]);
    const knowledgeNodes = vm.nodes.filter((n) => n.kind === "knowledge");
    const projectNodes = vm.nodes.filter((n) => n.kind === "project");
    expect(knowledgeNodes.map((n) => n.id)).toEqual(["k-1", "k-2", "k-3"]);
    expect(projectNodes).toEqual([
      { id: "project:p-1", kind: "project", title: "本地记忆一期" },
    ]);
    expect(vm.stats).toEqual({
      knowledgeNodes: 3,
      projectNodes: 1,
      relationEdges: 1,
      usageEdges: 1,
      isolatedCount: 1, // k-3
    });
  });

  it("relation 边带 relationType/strength/createdByType;悬空边丢弃", () => {
    const vm = buildKnowledgeGraphVm(items, relations, [], []);
    const rel = vm.edges.filter((e) => e.kind === "relation");
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({
      source: "k-2",
      target: "k-1",
      relationType: "supports",
      createdByType: "user",
    });
  });

  it("usage 边带 stage/role/projectTitle/createdAt;项目标题缺失以 id 兜底(不编名)", () => {
    const vm = buildKnowledgeGraphVm(items, [], links, []);
    const usage = vm.edges.filter((e) => e.kind === "usage");
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      source: "k-1",
      target: "project:p-1",
      stage: "script",
      role: "reference",
      projectTitle: "p-1",
    });
  });

  it("空库 → 全空 stats(诚实空态,不编数据)", () => {
    const vm = buildKnowledgeGraphVm([], [], [], []);
    expect(vm.nodes).toEqual([]);
    expect(vm.edges).toEqual([]);
    expect(vm.stats).toEqual({
      knowledgeNodes: 0,
      projectNodes: 0,
      relationEdges: 0,
      usageEdges: 0,
      isolatedCount: 0,
    });
  });
});
