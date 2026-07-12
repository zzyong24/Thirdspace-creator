/**
 * [T-247] 知识库读侧滤 archived:knowledge.list 是全量行(repo 不按 status 过滤),
 * 装配层必须把 archived 条目挡在列表/指标外 —— 归档动作在 UI 上真生效的锚定测试。
 */

import { describe, expect, it } from "vitest";

import {
  buildKnowledgeDashboardViewModel,
  type KnowledgeDataClient,
} from "./knowledge-data";

function makeClient(items: ReadonlyArray<Record<string, unknown>>): KnowledgeDataClient {
  return {
    listKnowledge: () => Promise.resolve(items),
    listKnowledgeRelations: () => Promise.resolve([]),
    listTags: () => Promise.resolve([]),
    listEntitiesForTag: () => Promise.resolve([]),
  } as unknown as KnowledgeDataClient;
}

function item(id: string, status: "active" | "archived") {
  return {
    id,
    title: `条目 ${id}`,
    knowledgeType: "note",
    status,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    sourceType: "manual",
    sourceUrl: null,
    sourceNote: null,
    usedCount: 0,
    usedInPublished: false,
  };
}

describe("knowledge-data 读侧滤 archived (T-247)", () => {
  it("archived 条目不进 recent 列表;active 正常进", async () => {
    const vm = await buildKnowledgeDashboardViewModel(
      makeClient([item("k-active", "active"), item("k-archived", "archived")]),
    );
    const ids = vm.recent.map((row) => row.id);
    expect(ids).toContain("k-active");
    expect(ids).not.toContain("k-archived");
  });

  it("全部 archived → 诚实空列表(不回退 fixture)", async () => {
    const vm = await buildKnowledgeDashboardViewModel(
      makeClient([item("k-1", "archived")]),
    );
    expect(vm.recent.length).toBe(0);
  });
});
