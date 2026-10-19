/**
 * KnowledgeGraphView 交互测试(T-091 复原 / T-260a·b)。echarts 经 next/dynamic
 * (ssr:false)在 jsdom 渲 loading 占位,不验证画布本体;验证的是围绕图的**真值层**:
 *  - stats 条数字与 GraphVm 一致(SQL 手查同一口径);
 *  - 空库诚实空态 / 关系 0 诚实引导 / 稀疏引导语;
 *  - [T-260a] 节点上限:>150 节点采样虚化 + 「显示前 N,共 M」诚实提示;
 *  - [T-260a] 移动端降级:渲 stats 摘要 + 提示桌面查看;
 *  - 「AI 找关联」→ fetch /api/knowledge/relate → 候选确认门(reason 展示;已存在
 *    同向同类型边标灰「已存在」)→ 采纳选中 → 逐条 relations.create(createdByType='ai')
 *    + refresh;未勾选不落库;空候选诚实文案;
 *  - [T-260b] 图面删边:「已建关联」清单逐条删 → removeKnowledgeRelation
 *    (source/target/type)+ refresh。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const createKnowledgeRelation = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "rel-new" }),
);
const removeKnowledgeRelation = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({}),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledgeRelation: (input: unknown) =>
      createKnowledgeRelation(input as never),
    removeKnowledgeRelation: (input: unknown) =>
      removeKnowledgeRelation(input as never),
  },
}));

import { KnowledgeGraphView } from "./knowledge-graph-view";
import type { KnowledgeGraphVm } from "./knowledge-graph-vm";
import { CURRENT_ACCOUNT_KEY } from "@/lib/http-transport";

const fetchMock = vi.fn();

beforeEach(() => {
  mockRouter.refresh.mockClear();
  createKnowledgeRelation.mockClear();
  removeKnowledgeRelation.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
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

  it("[T-260a] 移动端降级:渲 stats 摘要提示(桌面端查看力导向图)", () => {
    const { container } = render(
      <KnowledgeGraphView graph={GRAPH} onSelectKnowledge={() => {}} />,
    );
    const hint = container.querySelector(
      '[data-slot="knowledge-graph-mobile-hint"]',
    );
    expect(hint).not.toBeNull();
    expect(hint!.textContent ?? "").toContain("桌面端查看");
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

  it("[T-260a] 关系 0(非空库)→ 诚实引导点『AI 找关联』,不留空白画布", () => {
    const noRel: KnowledgeGraphVm = {
      nodes: [
        { id: "k-1", kind: "knowledge", knowledgeType: "claim", title: "观点A" },
        { id: "k-2", kind: "knowledge", knowledgeType: "evidence", title: "证据B" },
      ],
      edges: [],
      stats: {
        knowledgeNodes: 2,
        projectNodes: 0,
        relationEdges: 0,
        usageEdges: 0,
        isolatedCount: 2,
      },
    };
    const { container, getByText } = render(
      <KnowledgeGraphView graph={noRel} onSelectKnowledge={() => {}} />,
    );
    const guide = container.querySelector(
      '[data-slot="knowledge-graph-no-relations"]',
    );
    expect(guide).not.toBeNull();
    expect(guide!.textContent ?? "").toContain("AI 找关联");
    // 「AI 找关联」按钮仍在(引导用户去点它)。
    expect(getByText("AI 找关联")).toBeTruthy();
    // 无 relation 边 → 不渲「已建关联」删边清单(不摆空区)。
    expect(
      container.querySelector('[data-slot="knowledge-graph-relations"]'),
    ).toBeNull();
  });

  it("[T-260a] >150 节点 → 采样虚化 + 「显示前 150,共 M」诚实提示", () => {
    const nodes = Array.from({ length: 160 }, (_, i) => ({
      id: `k-${i}`,
      kind: "knowledge" as const,
      knowledgeType: "claim",
      title: `原子${i}`,
      usedCount: i,
      usedInPublished: false,
    }));
    const capped: KnowledgeGraphVm = {
      nodes,
      edges: [],
      stats: {
        knowledgeNodes: 160,
        projectNodes: 0,
        relationEdges: 0,
        usageEdges: 0,
        isolatedCount: 160,
      },
    };
    const { container } = render(
      <KnowledgeGraphView graph={capped} onSelectKnowledge={() => {}} />,
    );
    const capHint = container.querySelector(
      '[data-slot="knowledge-graph-cap-hint"]',
    );
    expect(capHint).not.toBeNull();
    expect(capHint!.textContent ?? "").toContain("150");
    expect(capHint!.textContent ?? "").toContain("160");
  });

  it("AI 找关联 → 候选门(reason 展示;已存在边标灰)→ 采纳 → relations.create(createdByType='ai')", async () => {
    window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "acct-graph");
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
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("x-account-id")).toBe("acct-graph");
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
    const alert = container.querySelector('[data-slot="knowledge-graph-error"]');
    expect(alert?.textContent).toBe("还没有可用的 AI 模型。完成设置后，回到这里即可继续。");
    expect(alert?.textContent).not.toContain("凭据");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(createKnowledgeRelation).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("[T-260b] 图面删边:「已建关联」清单点删除 → removeKnowledgeRelation(source/target/type)+ refresh", async () => {
    const { container } = render(
      <KnowledgeGraphView graph={GRAPH} onSelectKnowledge={() => {}} />,
    );
    // relation 边(k-2 supports k-1)渲入删边清单;usage 边不进(不可删)。
    const rows = container.querySelectorAll(
      '[data-slot="knowledge-graph-relation-row"]',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getAttribute("data-relation-type")).toBe("supports");
    const del = rows[0]!.querySelector(
      '[data-slot="knowledge-graph-edge-delete"]',
    ) as HTMLButtonElement;
    fireEvent.click(del);
    await waitFor(() =>
      expect(removeKnowledgeRelation).toHaveBeenCalledTimes(1),
    );
    expect(removeKnowledgeRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { knowledgeId: "k-2" },
        body: { targetKnowledgeId: "k-1", relationType: "supports" },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });
});
