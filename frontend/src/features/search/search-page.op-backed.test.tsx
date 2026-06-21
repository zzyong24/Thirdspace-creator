/**
 * Op-backed Global Search FE wiring test (Module 02, Task 6).
 *
 * Renders SearchPage with a `viewModel` produced by the
 * `globalSearchPageToViewModel` adapter over a `globalSearchPage`-shaped fixture
 * (the same shape the `pages.search.get` op returns). Asserts:
 *   - history rows render as <Link href="/search?q=…"> (§296 re-run);
 *   - the result groups render the OP-supplied data, not the static fixture
 *     selector (`buildSearchViewModel`).
 */

import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { globalSearchPageToViewModel } from "./search-view-model";

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

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams("q=钩子"),
}));

// A `globalSearchPage`-shaped fixture with op-unique ids/titles that do NOT
// appear in the canonical fixture selector — so a passing assertion proves the
// page rendered the OP data, not buildSearchViewModel().
const OP_PAGE = {
  scenario: "default" as const,
  kind: "search" as const,
  loading: false,
  error: null,
  query: "钩子",
  resultTabs: [
    { id: "project", label: "项目", count: 1 },
    { id: "knowledge", label: "知识", count: 1 },
    { id: "asset", label: "素材", count: 1 },
    { id: "video", label: "视频", count: 1 },
  ],
  projects: [
    { id: "op-project-xyz", title: "OP 项目标题 ZZZ", stage: "script", progressPct: 42, snippet: "op snippet" },
  ],
  knowledge: [
    { id: "op-knowledge-xyz", title: "OP 知识标题 ZZZ", excerpt: "op excerpt", tags: ["AI"] },
  ],
  assets: [
    { id: "op-asset-xyz", title: "OP 素材标题 ZZZ", assetType: "image" },
  ],
  videos: [
    { id: "op-video-xyz", title: "OP 视频标题 ZZZ", platform: "bilibili", durationLabel: "12:03" },
  ],
  filters: [
    { id: "f-type", label: "类型", options: ["项目", "知识"] },
  ],
  quickActions: [{ id: "qa-new-project", label: "新建项目" }],
  history: [
    { id: "op-hist-1", query: "钩子 公式", searchedAt: "2026-06-20T00:00:00.000Z" },
  ],
  tips: ["op tip"],
};

async function renderOpBacked() {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { SearchPage } = await import("./search-page");
  const viewModel = globalSearchPageToViewModel(OP_PAGE);
  return render(
    <AppShell
      pathname="/search"
      headerMode="search"
      pageTitle="全局搜索"
      contextualCardVariant="assistant"
    >
      <SearchPage viewModel={viewModel} initialQuery="钩子" />
    </AppShell>,
  );
}

describe("SearchPage (op-backed)", () => {
  afterEach(() => cleanup());

  it("renders history rows as links to /search?q=<query> (§296)", async () => {
    const { container } = await renderOpBacked();
    const links = container.querySelectorAll(
      '[data-slot="search-history-link"]',
    );
    expect(links.length).toBe(1);
    expect(links[0]!.getAttribute("href")).toBe(
      `/search?q=${encodeURIComponent("钩子 公式")}`,
    );
  });

  it("renders the op-supplied result groups (not the static fixture selector)", async () => {
    const { container } = await renderOpBacked();
    const projectCard = container.querySelector(
      '[data-project-id="op-project-xyz"]',
    );
    expect(projectCard).not.toBeNull();
    const knowledgeRow = container.querySelector(
      '[data-knowledge-id="op-knowledge-xyz"]',
    );
    expect(knowledgeRow).not.toBeNull();
    const assetThumb = container.querySelector(
      '[data-asset-id="op-asset-xyz"]',
    );
    expect(assetThumb).not.toBeNull();
    const videoThumb = container.querySelector(
      '[data-video-id="op-video-xyz"]',
    );
    expect(videoThumb).not.toBeNull();
    // The op-unique title text is present (proves it is NOT the fixture VM).
    expect(container.textContent).toContain("OP 项目标题 ZZZ");
  });
});
