/**
 * [T-198] 知识详情预览的正文渲染测试。
 *  ① 课程 YAML 内容 → 结构化区块(带小标题:一句话/正文/案例/易错点/苏格拉底提问/要点)。
 *  ② 普通 markdown / 纯文本 → 诚实退回 markdown 渲染,绝不崩。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const mockClient = {
  getKnowledge: vi.fn(),
  listKnowledgeRevisions: vi.fn(),
  listKnowledge: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  createKnowledgeRelation: vi.fn((_i: unknown) => Promise.resolve({ id: "rel" })),
  // [T-247] 已建关系列表 + 删除。
  listKnowledgeRelations: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve([])),
  removeKnowledgeRelation: vi.fn((_i: unknown): Promise<unknown> => Promise.resolve({})),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    getKnowledge: (i: unknown) => mockClient.getKnowledge(i),
    listKnowledgeRevisions: (i: unknown) => mockClient.listKnowledgeRevisions(i),
    listKnowledge: (i: unknown) => mockClient.listKnowledge(i),
    createKnowledgeRelation: (i: unknown) => mockClient.createKnowledgeRelation(i),
    listKnowledgeRelations: (i: unknown) => mockClient.listKnowledgeRelations(i),
    removeKnowledgeRelation: (i: unknown) => mockClient.removeKnowledgeRelation(i),
  },
}));

const LESSON_YAML = [
  "- id: KP-01-1",
  "  lesson: 1",
  "  module: 认知定位",
  "  title: 粉丝经济的核心公式",
  "  difficulty: 中",
  "",
  "  one_line: 产品满足需求,人物制造偏好。",
  "",
  "  core: |",
  "    这是全课的地基。",
  "",
  "  examples: |",
  "    管大叔卖樱桃案例。",
  "",
  "  misconceptions: |",
  "    以为东西好就该卖出去。",
  "",
  "  socratic:",
  "    - q: 产品和人物各自负责什么?",
  "      key_points:",
  "        - 产品满足需求",
  "        - 人物制造偏好",
  "      hint: 想想管大叔。",
].join("\n");

function setRevision(content: string, sourceType = "import") {
  mockClient.getKnowledge.mockResolvedValue({
    id: "k-1",
    title: "选中条目",
    sourceType,
    sourceUrl: null,
    currentRevisionId: "rev-1",
  });
  mockClient.listKnowledgeRevisions.mockResolvedValue([
    { id: "rev-1", revisionNumber: 1, content },
  ]);
}

async function renderPreview() {
  const { KnowledgeDetailPreview } = await import("./knowledge-detail-preview");
  return render(<KnowledgeDetailPreview knowledgeId="k-1" />);
}

afterEach(() => cleanup());
beforeEach(() => {
  mockClient.getKnowledge.mockReset();
  mockClient.listKnowledgeRevisions.mockReset();
  mockClient.listKnowledgeRelations.mockClear();
  mockClient.listKnowledgeRelations.mockResolvedValue([]);
  mockClient.removeKnowledgeRelation.mockClear();
  mockClient.removeKnowledgeRelation.mockResolvedValue({});
});

describe("KnowledgeDetailPreview 正文渲染 (T-198)", () => {
  it("① 课程 YAML → 结构化区块(小标题 + 苏格拉底要点)", async () => {
    setRevision(LESSON_YAML);
    const { container } = await renderPreview();

    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="knowledge-detail-content"]'),
      ).not.toBeNull(),
    );
    const body = container.querySelector(
      '[data-slot="knowledge-detail-content"]',
    ) as HTMLElement;
    // 走结构化(非 markdown dump)。
    expect(body.getAttribute("data-structured")).toBe("lesson");
    expect(container.querySelector('[data-slot="lesson-point"]')).not.toBeNull();
    // 各小标题区块都在。
    for (const slot of [
      "lesson-one-line",
      "lesson-core",
      "lesson-examples",
      "lesson-misconceptions",
      "lesson-socratic",
    ]) {
      expect(container.querySelector(`[data-slot="${slot}"]`)).not.toBeNull();
    }
    // 小标题文案可读。
    const text = body.textContent ?? "";
    expect(text).toContain("一句话");
    expect(text).toContain("正文");
    expect(text).toContain("案例");
    expect(text).toContain("易错点");
    expect(text).toContain("苏格拉底提问");
    expect(text).toContain("要点");
    expect(text).toContain("粉丝经济的核心公式");
    // 苏格拉底要点两条。
    expect(
      container.querySelectorAll('[data-slot="socratic-key-point"]'),
    ).toHaveLength(2);
    // 绝不把原始 YAML 键 dump 出来。
    expect(text).not.toContain("one_line:");
    expect(text).not.toContain("key_points:");
  });

  it("② 普通 markdown → 退回 markdown 渲染(不崩,不误判为结构化)", async () => {
    setRevision("# 普通标题\n\n正文**加粗**内容", "web");
    const { container } = await renderPreview();

    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-slot="knowledge-detail-preview"][data-phase="ready"]',
        ),
      ).not.toBeNull(),
    );
    const body = container.querySelector(
      '[data-slot="knowledge-detail-content"]',
    ) as HTMLElement;
    expect(body).not.toBeNull();
    // 不是结构化课程渲染。
    expect(body.getAttribute("data-structured")).toBeNull();
    expect(container.querySelector('[data-slot="lesson-point"]')).toBeNull();
    // markdown 正常渲染(# → h1,** ** → strong)。
    expect(body.querySelector("h1")?.textContent).toBe("普通标题");
    expect(body.querySelector("strong")?.textContent).toBe("加粗");
  });
});

// ---------------------------------------------------------------------------
// [T-247] 已建关系列表 + 删除(knowledge.relations.delete)
// ---------------------------------------------------------------------------

describe("KnowledgeRelationsList 关联删除 (T-247)", () => {
  it("有既有边 → 渲染关系行(类型 + 目标标题);点删除 → removeKnowledgeRelation + 重拉", async () => {
    setRevision("正文");
    mockClient.listKnowledgeRelations
      .mockResolvedValueOnce([
        {
          id: "rel-1",
          sourceKnowledgeId: "k-1",
          targetKnowledgeId: "k-2",
          relationType: "references",
        },
      ])
      // 删除后的重拉 → 空列表(行消失)。
      .mockResolvedValueOnce([]);
    mockClient.listKnowledge.mockResolvedValue([
      { id: "k-2", title: "目标条目" },
    ]);
    const { container } = await renderPreview();

    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="knowledge-relation-row"]'),
      ).not.toBeNull(),
    );
    const row = container.querySelector(
      '[data-slot="knowledge-relation-row"]',
    ) as HTMLElement;
    expect(row.getAttribute("data-relation-type")).toBe("references");
    expect(row.textContent).toContain("目标条目");

    const del = row.querySelector(
      '[data-slot="knowledge-relation-delete"]',
    ) as HTMLButtonElement;
    fireEvent.click(del);

    await waitFor(() =>
      expect(mockClient.removeKnowledgeRelation).toHaveBeenCalledTimes(1),
    );
    expect(mockClient.removeKnowledgeRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { knowledgeId: "k-1" },
        body: { targetKnowledgeId: "k-2", relationType: "references" },
      }),
    );
    // 重拉后空列表 → 行消失(以服务端读回为准,不做乐观假删)。
    await waitFor(() =>
      expect(
        container.querySelector('[data-slot="knowledge-relation-row"]'),
      ).toBeNull(),
    );
  });

  it("无既有边 → 不渲染「已建关联」区(不摆空区)", async () => {
    setRevision("正文");
    const { container } = await renderPreview();
    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-slot="knowledge-detail-preview"][data-phase="ready"]',
        ),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector('[data-slot="knowledge-relations-list"]'),
    ).toBeNull();
  });
});
