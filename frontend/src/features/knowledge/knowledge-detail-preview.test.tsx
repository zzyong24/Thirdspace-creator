/**
 * [T-198 / T-260b·c] 知识详情预览测试。
 *  ① 课程 YAML 内容 → 结构化区块(带小标题:一句话/正文/案例/易错点/苏格拉底提问/要点)。
 *  ② 普通 markdown / 纯文本 → 诚实退回 markdown 渲染,绝不崩。
 *  ③ [T-260c] 读回最新正文经 onContentLoaded 回传(编辑全文预填源)。
 *  ④ [T-260b] 关系管理(建边/删边)已移到关系图主面 —— 预览里不再挂
 *     「关联到…」(KnowledgeRelateEntry)/「已建关联」删除(KnowledgeRelationsList)。
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
  getKnowledge: vi.fn(),
  listKnowledgeRevisions: vi.fn(),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    getKnowledge: (i: unknown) => mockClient.getKnowledge(i),
    listKnowledgeRevisions: (i: unknown) => mockClient.listKnowledgeRevisions(i),
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

async function renderPreview(
  props: Partial<{ onContentLoaded: (c: string) => void }> = {},
) {
  const { KnowledgeDetailPreview } = await import("./knowledge-detail-preview");
  return render(<KnowledgeDetailPreview knowledgeId="k-1" {...props} />);
}

afterEach(() => cleanup());
beforeEach(() => {
  mockClient.getKnowledge.mockReset();
  mockClient.listKnowledgeRevisions.mockReset();
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
// [T-260c] 最新正文回传(编辑全文预填源)
// ---------------------------------------------------------------------------

describe("KnowledgeDetailPreview onContentLoaded (T-260c)", () => {
  it("读回最新修订正文 → 经 onContentLoaded 回传(供编辑全文预填)", async () => {
    setRevision("# 标题\n\n正文全文");
    const onContentLoaded = vi.fn();
    await renderPreview({ onContentLoaded });
    await waitFor(() =>
      expect(onContentLoaded).toHaveBeenCalledWith("# 标题\n\n正文全文"),
    );
  });
});

// ---------------------------------------------------------------------------
// [T-260b] 关系管理已移图面 —— 详情预览回归「预览 + 归档」,不再挂建边/删边入口
// ---------------------------------------------------------------------------

describe("KnowledgeDetailPreview 关系管理已下线 (T-260b)", () => {
  it("预览里不再渲染「关联到…」建边入口 / 「已建关联」删除清单", async () => {
    setRevision("正文");
    const { container } = await renderPreview();
    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-slot="knowledge-detail-preview"][data-phase="ready"]',
        ),
      ).not.toBeNull(),
    );
    // 人手动建边入口(T-091)已移除。
    expect(
      container.querySelector('[data-slot="knowledge-relate-entry"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="knowledge-relate-toggle"]'),
    ).toBeNull();
    // 详情内的删边清单(T-247)已移到关系图主面。
    expect(
      container.querySelector('[data-slot="knowledge-relations-list"]'),
    ).toBeNull();
  });
});
