/**
 * Contract tests for the Knowledge & Memory page (Task 19).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning (page-specs §11, decision-log D-002):
 *  - The TopHeader renders in `global` mode with the canonical
 *    page title "知识库".
 *  - The sidebar marks "知识库" as the active nav item.
 *  - The page renders a KnowledgeToolbar with search + filter affordances.
 *  - The page renders a KnowledgeMetrics row with exactly FOUR
 *    MetricCard items in a single row (T-199 dropped the 记忆命中率
 *    「规划中」 placeholder card).
 *  - The KnowledgeGrid renders three columns in the spec order:
 *      CategoryPanel → RecentKnowledgeTable → InsightRail.
 *  - The InsightRail contains the four insight blocks in the
 *    locked spec order: PopularTags → MemoryInsights →
 *    UnsortedItems → ReusableSnippets. The MemoryInsights block
 *    is NOT removed (forbidden by page-specs §11).
 *  - T-199 removed the KnowledgeGraph block + the 知识图谱 force view
 *    (and its bottom whitespace) from the knowledge page.
 *  - The page is wrapped in the shared AppShell with exactly one
 *    Sidebar and one TopHeader — no second Shell is created
 *    (D-002: project identity is part of the Header region, not
 *    a second Shell).
 *
 * The component is a Server Component. The test renders it inside
 * the shared AppShell the same way `(creator)/layout.tsx` does so
 * the header-mode / sidebar-active / single-shell assertions run
 * against the same DOM a real route render would produce.
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// The interactive island now calls `useRouter()` (F1b/F1c write affordances).
// Stub `next/navigation` so the island mounts without a real App Router provider;
// these structural tests never trigger a write, so a no-op router suffices.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

// Stub `next/link` so we can assert href values without the Next.js
// runtime mounting a router.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type KnowledgePageProps = React.ComponentProps<
  typeof import("./knowledge-page").KnowledgePage
>;

// The (creator)/layout already mounts the shared AppShell. For the
// unit test we replicate that wrapper so the "Knowledge active in
// sidebar" check runs against the same DOM shape a real page render
// would produce.
async function renderKnowledge(overrides: Partial<KnowledgePageProps> = {}) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { KnowledgePage } = await import("./knowledge-page");
  const { buildKnowledgeViewModel } = await import("@/fixtures/selectors");
  // `KnowledgePage` is now an async Server Component (F1a: it `await`s the real
  // `knowledge.list` op in production). The unit test drives it through the
  // `viewModel?` override seam so it stays sync + fixture-driven — the DOM it
  // renders is identical to the previous server-only render. We resolve the
  // async element first (mirrors the Projects page test), then mount it.
  const viewModel = overrides.viewModel ?? buildKnowledgeViewModel();
  const element = await KnowledgePage({ ...overrides, viewModel });
  return render(
    <AppShell pathname="/knowledge" headerMode="global" pageTitle="知识库">
      {element}
    </AppShell>,
  );
}

describe("KnowledgePage", () => {
  it("知识库排在第一个 Tab，IP 实战课排在第二个 Tab", async () => {
    await renderKnowledge();
    const tabs = screen.getByRole("navigation", { name: "知识库视图" });
    const links = Array.from(tabs.querySelectorAll("a")).map((node) =>
      node.textContent?.trim(),
    );
    expect(links).toEqual(["我的知识", "IP 实战课"]);
  });
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in global mode with the knowledge page title", async () => {
    const { container } = await renderKnowledge();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("global");
    const heading = container.querySelector(
      '[data-slot="header-page-heading"]',
    );
    expect(heading).not.toBeNull();
    expect(heading!.textContent ?? "").toContain("知识库");
  });

  it("marks the Knowledge nav item as the active page in the sidebar", async () => {
    await renderKnowledge();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/knowledge");
    expect(active.textContent?.trim()).toBe("知识库");
  });

  it("renders the KnowledgeToolbar with search and filter affordances", async () => {
    const { container } = await renderKnowledge();
    const toolbar = container.querySelector(
      '[data-slot="knowledge-toolbar"]',
    ) as HTMLElement;
    expect(toolbar).not.toBeNull();
    const search = toolbar.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement | null;
    expect(search).not.toBeNull();
  });

  it("[T-118b gate-F4] 页头挂「记一条经验」入口(经验 Tab 退役后的唯一记经验入口)", async () => {
    const { container } = await renderKnowledge();
    const captureLink = container.querySelector(
      '[data-slot="knowledge-header"] [data-slot="experience-capture-link"]',
    );
    expect(captureLink).not.toBeNull();
    expect(captureLink!.textContent).toContain("记一条经验");
  });

  it("[T-546] 暂停展示文件工作区 UI，知识库其余能力保持可用", async () => {
    const { container } = await renderKnowledge();
    expect(
      container.querySelector('[data-slot="knowledge-file-workspace"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="knowledge-dump-zone"]'),
    ).not.toBeNull();
  });

  it("renders exactly four KnowledgeMetric cards in a single row", async () => {
    const { container } = await renderKnowledge();
    const row = container.querySelector(
      '[data-slot="knowledge-metrics"]',
    ) as HTMLElement;
    expect(row).not.toBeNull();
    const cards = row.querySelectorAll('[data-slot="metric-card"]');
    expect(cards).toHaveLength(4);
  });

  it("T-199 去掉「记忆命中率」规划中占位卡(不再渲染)", async () => {
    const { container } = await renderKnowledge();
    const row = container.querySelector(
      '[data-slot="knowledge-metrics"]',
    ) as HTMLElement;
    expect(row.textContent ?? "").not.toContain("记忆命中率");
    expect(row.textContent ?? "").not.toContain("规划中");
  });

  it("renders the three-column KnowledgeGrid (Category / Table / InsightRail) in spec order", async () => {
    const { container } = await renderKnowledge();
    const grid = container.querySelector(
      '[data-slot="knowledge-grid"]',
    ) as HTMLElement;
    expect(grid).not.toBeNull();
    const expectedSlots = [
      "category-panel",
      "recent-knowledge-table",
      "insight-rail",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      grid.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("renders the four InsightRail blocks in the locked spec order", async () => {
    const { container } = await renderKnowledge();
    const rail = container.querySelector(
      '[data-slot="insight-rail"]',
    ) as HTMLElement;
    expect(rail).not.toBeNull();
    const expectedSlots = [
      "popular-tags",
      "memory-insights",
      "unsorted-items",
      "reusable-snippets",
    ];
    const orderedNodes = expectedSlots.map((slot) =>
      rail.querySelector(`[data-slot="${slot}"]`),
    );
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      const relation = previous.compareDocumentPosition(node);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("does not remove the MemoryInsights block (page-specs §11 invariant)", async () => {
    const { container } = await renderKnowledge();
    const memory = container.querySelector(
      '[data-slot="memory-insights"]',
    ) as HTMLElement;
    expect(memory).not.toBeNull();
    const items = memory.querySelectorAll(
      '[data-slot="memory-insight-item"]',
    );
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it("[T-260a] 复原力导向关系图为探索主面;仍不复原摘要 bar 图(那才是 T-199 空白源)", async () => {
    const { buildKnowledgeViewModel } = await import("@/fixtures/selectors");
    const base = buildKnowledgeViewModel();
    // VM 提供 graph → 交互岛渲「关系图」视图并作探索主面(默认视图)。
    const graph: import("./knowledge-graph-vm").KnowledgeGraphVm = {
      nodes: [
        { id: "k-1", kind: "knowledge", knowledgeType: "claim", title: "观点A", usedCount: 1, usedInPublished: false },
        { id: "k-2", kind: "knowledge", knowledgeType: "evidence", title: "证据B", usedCount: 0, usedInPublished: false },
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
    const { container } = await renderKnowledge({
      viewModel: { ...base, graph },
    });
    // 力导向关系图视图已复原(探索主面)。
    expect(
      container.querySelector('[data-slot="knowledge-graph-view"]'),
    ).not.toBeNull();
    // 视图切换出现「关系图」tab。
    expect(
      container.querySelector(
        '[data-slot="knowledge-view-switch-option"][data-view-id="graph"]',
      ),
    ).not.toBeNull();
    // 但 T-199 该删的摘要 bar 图(KnowledgeGraph ChartFrame)保持删除 —— 那才是空白源。
    expect(container.querySelector('[data-slot="knowledge-graph"]')).toBeNull();
    // 页面仍是单一 AppShell + 单一 <main>。
    const shells = container.querySelectorAll('[data-slot="app-shell"]');
    expect(shells).toHaveLength(1);
    const mains = container.querySelectorAll('main[data-page="knowledge"]');
    expect(mains).toHaveLength(1);
  });

  it("keeps the page inside the single AppShell — no second Sidebar/TopHeader", async () => {
    const { container } = await renderKnowledge();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
  });

  it("renders PopularTags as a multi-row tag cloud (≥ 4 chips)", async () => {
    const { container } = await renderKnowledge();
    const popular = container.querySelector(
      '[data-slot="popular-tags"]',
    ) as HTMLElement;
    expect(popular).not.toBeNull();
    const chips = popular.querySelectorAll('[data-slot="tag-chip"]');
    expect(chips.length).toBeGreaterThanOrEqual(4);
  });
});
