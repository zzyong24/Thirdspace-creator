/**
 * KnowledgeGraphView 交互测试(T-091)。echarts 经 next/dynamic(ssr:false)在 jsdom
 * 渲 loading 占位,不验证画布本体;验证的是围绕图的**真值层**:
 *  - stats 条数字与 GraphVm 一致(SQL 手查同一口径);
 *  - 空库诚实空态 / 稀疏引导语;
 *  - 「AI 找关联」→ fetch /api/knowledge/relate → 候选确认门(reason 展示;已存在
 *    同向同类型边标灰「已存在」)→ 采纳选中 → 逐条 relations.create(createdByType='ai')
 *    + refresh;未勾选不落库;空候选诚实文案。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const createKnowledgeRelation = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "rel-new" }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledgeRelation: (input: unknown) =>
      createKnowledgeRelation(input as never),
  },
}));

import { KnowledgeGraphView } from "./knowledge-graph-view";
import type { KnowledgeGraphVm } from "./knowledge-graph-vm";

const fetchMock = vi.fn();

beforeEach(() => {
  mockRouter.refresh.mockClear();
  createKnowledgeRelation.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GRAPH: KnowledgeGraphVm = {
  nodes: [
    { id: "k-1", kind: "knowledge", knowledgeType: "claim", title: "观点A", usedCount: 2, usedInPublished: true },
    { id: "k-2", kind: "knowledge", knowledgeType: "evidence", title: "证据B", usedCount: 0, usedInPublished: false },
    { id: "k-3", kind: "knowledge", knowledgeType: "quote", title: "金句C", usedCount: 0, usedInPublished: false },
    { id: "project:p-1", kind: "project", title: "本地记忆一期" },
  ],
  edges: [
    { source: "k-2", target: "k-1", kind: "relation", relationType: "supports", strength: 1, createdByType: "user" },
    { source: "k-1", target: "project:p-1", kind: "usage", stage: "script", role: "reference", projectTitle: "本地记忆一期", createdAt: "2026-07-01T00:00:00.000Z" },
  ],
  stats: {
    knowledgeNodes: 3,
    projectNodes: 1,
    relationEdges: 1,
    usageEdges: 1,
    isolatedCount: 1,
  },
};

function relateResponse(candidates: unknown[], ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve({ candidates }),
  } as unknown as Response;
}

describe("KnowledgeGraphView", () => {
  it("stats 条渲全真值计数;稀疏时渲引导语(不生成假边)", () => {
    const { container, getByText } = render(
      <KnowledgeGraphView graph={GRAPH} onSelectKnowledge={() => {}} />,
    );
    expect(getByText("3 条知识")).toBeTruthy();
    expect(getByText("1 条关联")).toBeTruthy();
    expect(getByText("1 条引用")).toBeTruthy();
    expect(getByText("孤立 1 条")).toBeTruthy();
    expect(
      container.querySelector('[data-slot="knowledge-graph-sparse-hint"]'),
    ).not.toBeNull();
  });

  it("空库 → 诚实空态,不渲图", () => {
    const empty: KnowledgeGraphVm = {
      nodes: [],
      edges: [],
      stats: {
        knowledgeNodes: 0,
        projectNodes: 0,
        relationEdges: 0,
        usageEdges: 0,
        isolatedCount: 0,
      },
    };
    const { container } = render(
      <KnowledgeGraphView graph={empty} onSelectKnowledge={() => {}} />,
    );
    expect(
      container.querySelector('[data-slot="knowledge-graph-empty"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-slot="echart"]')).toBeNull();
  });

  it("AI 找关联 → 候选门(reason 展示;已存在边标灰)→ 采纳 → relations.create(createdByType='ai')", async () => {
    fetchMock.mockResolvedValue(
      relateResponse([
        { sourceId: "k-3", targetId: "k-1", relationType: "extends", reason: "金句在观点基础上延伸" },
        // 与既有 supports 边同向同类型 → 门内标灰「已存在」。
        { sourceId: "k-2", targetId: "k-1", relationType: "supports", reason: "已存在的边" },
      ]),
    );
    const { container, getByText } = render(
      <KnowledgeGraphView graph={GRAPH} onSelectKnowledge={() => {}} />,
    );
    fireEvent.click(getByText("AI 找关联"));
    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-slot="knowledge-relate-candidate"]'),
      ).toHaveLength(2);
    });
    expect(getByText("金句在观点基础上延伸")).toBeTruthy();
    expect(getByText("已存在")).toBeTruthy();
    // 已存在的那条不可勾 → 只有 1 条可采纳。
    fireEvent.click(getByText("采纳选中 1 条"));
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(createKnowledgeRelation).toHaveBeenCalledTimes(1);
    expect(createKnowledgeRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { knowledgeId: "k-3" },
        body: {
          targetKnowledgeId: "k-1",
          relationType: "extends",
          createdByType: "ai",
        },
      }),
    );
  });

  it("AI 空候选 → 诚实文案(不硬凑)", async () => {
    fetchMock.mockResolvedValue(relateResponse([]));
    const { container, getByText } = render(
      <KnowledgeGraphView graph={GRAPH} onSelectKnowledge={() => {}} />,
    );
    fireEvent.click(getByText("AI 找关联"));
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="knowledge-relate-empty"]'),
      ).not.toBeNull();
    });
    expect(createKnowledgeRelation).not.toHaveBeenCalled();
  });

  it("AI 失败 → 内联错误(不静默)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "无可用 LLM 凭据" }),
    } as unknown as Response);
    const { container, getByText } = render(
      <KnowledgeGraphView graph={GRAPH} onSelectKnowledge={() => {}} />,
    );
    fireEvent.click(getByText("AI 找关联"));
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="knowledge-graph-error"]'),
      ).not.toBeNull();
    });
    expect(getByText("无可用 LLM 凭据")).toBeTruthy();
  });
});
