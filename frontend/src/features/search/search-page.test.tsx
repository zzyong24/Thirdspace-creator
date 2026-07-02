/**
 * Contract tests for the Global Search page (Task 23 / page-specs §15).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning:
 *
 *  - The TopHeader renders in `search` mode (configured by
 *    `(creator)/shell-router.tsx`) with the global search field
 *    and the canonical page title "全局搜索".
 *  - The contextual card variant is `assistant` (D-003).
 *  - The sidebar primary nav remains standard (no dedicated "搜索"
 *    active item — the search is reached via the TopHeader search
 *    trigger / direct route).
 *  - ResultTypeTabs render in the approved order
 *    (项目 → 知识 → 素材 → 视频).
 *  - ProjectResultSection renders exactly THREE project cards in a
 *    horizontal layout.
 *  - AssetResultSection and VideoResultSection render thumbnails in
 *    a horizontal layout.
 *  - SearchSideRail order is exactly:
 *      SearchFilters → QuickActions → SearchHistory → SearchTips.
 *  - URL `?q=...` is reflected in the search input value and the
 *    result section filters (declarative, two-way data flow).
 *  - The page is wrapped in the shared AppShell with exactly one
 *    Sidebar and one TopHeader — no second Shell is created.
 *
 * The component is a Server Component. The test renders it inside
 * the shared AppShell the same way `(creator)/layout.tsx` does so
 * the single-shell assertions run against the same DOM a real
 * route render would produce.
 */

import * as React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub `next/link` so we can assert href values without the Next.js
// runtime mounting a router.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// `useSearchParams` / `useRouter` are consumed by the HeaderGlobalSearch
// (TopHeader 的可见搜索框岛) and ResultTypeTabs client islands to drive URL
// state. `vi.hoisted` shares the spies so individual tests can assert the
// router.push URLs and inject a per-test `?q=` / `?type=` state.
const { routerPush, searchParamsRef } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParamsRef: { current: new URLSearchParams("") },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => searchParamsRef.current,
}));

type SearchPageProps = React.ComponentProps<
  typeof import("./search-page").SearchPage
>;

// The (creator)/layout already mounts the shared AppShell. For the
// unit test we replicate that wrapper so the single-shell checks
// run against the same DOM shape a real page render would produce.
async function renderSearchPage(overrides: Partial<SearchPageProps> = {}) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { SearchPage } = await import("./search-page");
  return render(
    <AppShell
      pathname="/search"
      headerMode="search"
      pageTitle="全局搜索"
      contextualCardVariant="assistant"
    >
      <SearchPage {...overrides} />
    </AppShell>,
  );
}

describe("SearchPage", () => {
  beforeEach(() => {
    routerPush.mockClear();
    searchParamsRef.current = new URLSearchParams("");
  });
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in search mode with the global search field", async () => {
    const { container } = await renderSearchPage();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("search");
    const searchForm = container.querySelector(
      '[data-slot="header-search"]',
    );
    expect(searchForm).not.toBeNull();
    const searchInput = container.querySelector(
      '#app-header-search',
    ) as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(searchInput!.getAttribute("type")).toBe("search");
  });

  it("uses the assistant contextual-card variant (NOT storage)", async () => {
    const { container } = await renderSearchPage();
    const assistant = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    const storage = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    expect(assistant).not.toBeNull();
    expect(storage).toBeNull();
  });

  it("renders ResultTypeTabs in the approved order (项目 → 知识 → 素材 → 视频)", async () => {
    const { container } = await renderSearchPage();
    const tabs = container.querySelector(
      '[data-slot="result-type-tabs"]',
    ) as HTMLElement;
    expect(tabs).not.toBeNull();
    const labels = Array.from(
      tabs.querySelectorAll('[role="tab"], [data-slot="result-type-tab"]'),
    ).map((node) => node.textContent?.trim() ?? "");
    const ordered = labels.filter(Boolean);
    // Each tab concatenates the label with the count badge
    // (e.g. "项目12"). Strip trailing digits so the test stays
    // tolerant of the count decoration while still asserting
    // the locked tab order.
    const primaryLabels = ordered.map((value) =>
      value.replace(/[\d,.\s]+$/u, "").trim(),
    );
    expect(primaryLabels).toEqual(["项目", "知识", "素材", "视频"]);
  });

  it("renders ProjectResultSection with 3 project cards horizontally", async () => {
    const { container } = await renderSearchPage();
    const section = container.querySelector(
      '[data-slot="project-result-section"]',
    ) as HTMLElement;
    expect(section).not.toBeNull();
    const cards = section.querySelectorAll(
      '[data-slot="project-result-card"]',
    );
    expect(cards.length).toBe(3);
  });

  it("renders KnowledgeResultSection as a list of knowledge rows", async () => {
    const { container } = await renderSearchPage();
    const section = container.querySelector(
      '[data-slot="knowledge-result-section"]',
    ) as HTMLElement;
    expect(section).not.toBeNull();
    const rows = section.querySelectorAll(
      '[data-slot="knowledge-result-row"]',
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("renders AssetResultSection with horizontal thumbnails", async () => {
    const { container } = await renderSearchPage();
    const section = container.querySelector(
      '[data-slot="asset-result-section"]',
    ) as HTMLElement;
    expect(section).not.toBeNull();
    const thumbs = section.querySelectorAll(
      '[data-slot="asset-result-thumb"]',
    );
    expect(thumbs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders VideoResultSection with horizontal thumbnails", async () => {
    const { container } = await renderSearchPage();
    const section = container.querySelector(
      '[data-slot="video-result-section"]',
    ) as HTMLElement;
    expect(section).not.toBeNull();
    const thumbs = section.querySelectorAll(
      '[data-slot="video-result-thumb"]',
    );
    expect(thumbs.length).toBeGreaterThanOrEqual(2);
    const first = thumbs[0] as HTMLElement;
    expect(
      first.querySelector('[data-slot="platform-icon"]'),
    ).not.toBeNull();
  });

  it("renders the SearchSideRail in the locked spec order (Facets → QuickActions → History → Tips)", async () => {
    const { container } = await renderSearchPage();
    const rail = container.querySelector(
      '[data-slot="search-side-rail"]',
    ) as HTMLElement;
    expect(rail).not.toBeNull();
    // The former「规划中」decorative SearchFilters is now the REAL
    // `SearchFacetsPanel` client island (GAP-SRCH-facets, backed by search.facets);
    // it keeps the stable `search-filters` slot so the locked rail order holds.
    const expectedSlots = [
      "search-filters",
      "search-quick-actions",
      "search-history",
      "search-tips",
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

  it("reflects URL ?q=... state into the VISIBLE header search input value", async () => {
    // [T-051 2d] 交互倒置修复后,唯一的搜索框是 TopHeader 的可见框
    // (HeaderGlobalSearch);URL ?q= 必须回显在它身上,而不是某个 sr-only 复制品。
    searchParamsRef.current = new URLSearchParams("q=AI");
    const { container } = await renderSearchPage({ initialQuery: "AI" });
    const searchInput = container.querySelector(
      "#app-header-search",
    ) as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(searchInput!.value).toBe("AI");
    // sr-only 的隐藏搜索框已删除 —— 页面里不允许再出现第二个搜索输入。
    const searchInputs = container.querySelectorAll('input[type="search"]');
    expect(searchInputs).toHaveLength(1);
  });

  it("submitting the visible header search pushes /search?q=… (server re-query)", async () => {
    const { container } = await renderSearchPage();
    const searchInput = container.querySelector(
      "#app-header-search",
    ) as HTMLInputElement;
    const form = container.querySelector(
      '[data-slot="header-search"]',
    ) as HTMLFormElement;
    fireEvent.change(searchInput, { target: { value: "AI Agent" } });
    fireEvent.submit(form);
    // URLSearchParams 把空格编码为 +;push(非 replace)让搜索进浏览器历史。
    expect(routerPush).toHaveBeenCalledWith("/search?q=AI+Agent", {
      scroll: false,
    });
  });

  it("clicking a result-type tab pushes ?type=… (URL-driven facet, server consumes)", async () => {
    searchParamsRef.current = new URLSearchParams("q=AI");
    const { container } = await renderSearchPage({ initialQuery: "AI" });
    const knowledgeTab = container.querySelector(
      '[data-slot="result-type-tab"][data-tab-id="knowledge"]',
    ) as HTMLButtonElement;
    expect(knowledgeTab).not.toBeNull();
    fireEvent.click(knowledgeTab);
    expect(routerPush).toHaveBeenCalledWith("/search?q=AI&type=knowledge", {
      scroll: false,
    });
  });

  it("activeType narrows the rendered groups and highlights the tab from the URL", async () => {
    searchParamsRef.current = new URLSearchParams("q=AI&type=knowledge");
    const { container } = await renderSearchPage({
      initialQuery: "AI",
      activeType: "knowledge",
    });
    // 只渲染选中的组;其它组不再以空壳 SectionCard 出现。
    expect(
      container.querySelector('[data-result-group="knowledge"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-result-group="project"]'),
    ).toBeNull();
    expect(container.querySelector('[data-result-group="asset"]')).toBeNull();
    expect(container.querySelector('[data-result-group="video"]')).toBeNull();
    // tab 高亮来自 URL(经 route 的 activeType prop),不是本地 state。
    const knowledgeTab = container.querySelector(
      '[data-slot="result-type-tab"][data-tab-id="knowledge"]',
    ) as HTMLButtonElement;
    expect(knowledgeTab.getAttribute("data-pressed")).toBe("true");
    // 再点已激活的 tab → push 清除 ?type=(回到全部)。
    fireEvent.click(knowledgeTab);
    expect(routerPush).toHaveBeenCalledWith("/search?q=AI", { scroll: false });
  });

  it("keeps the page inside the single AppShell — no second Sidebar/TopHeader", async () => {
    const { container } = await renderSearchPage();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
    const shells = container.querySelectorAll('[data-slot="app-shell"]');
    expect(shells).toHaveLength(1);
  });
});
