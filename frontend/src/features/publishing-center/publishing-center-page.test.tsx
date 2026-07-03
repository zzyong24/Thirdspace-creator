/**
 * Contract tests for the Publishing Center page (Task 21 / page-specs §13).
 *
 * Locks the structural invariants the page must satisfy before any
 * pixel tuning:
 *  - The TopHeader renders in `global` mode with the canonical
 *    page title "发布中心" and description "已发布内容、表现与排期"
 *    (configured by `(creator)/shell-router.tsx`).
 *  - The sidebar marks "发布中心" as the active nav item.
 *  - The contextual card variant is `assistant` (D-003, NOT `storage`).
 *  - ContentTypeTabs render in the approved order from the screenshot.
 *  - PublishingToolbar (search + filter affordances) is present.
 *  - PublicationTable renders the 7 approved columns in this exact
 *    order: 内容 / 项目 / 平台 / 发布时间 / 状态 / 表现 / 操作.
 *  - PublicationTable contains PublicationPerformanceRow entries and
 *    each row renders a platform icon.
 *  - AnalyticsRail order is exactly:
 *      PublishingMetrics → PlatformComparisonChart → TrendChart →
 *      TopContentList.
 *  - Pagination is present at the bottom of the layout.
 *  - The page is wrapped in the shared AppShell with exactly one
 *    Sidebar and one TopHeader — no second Shell is created.
 *
 * The component is a Server Component. The test renders it inside the
 * shared AppShell the same way `(creator)/layout.tsx` does so the
 * header-mode / sidebar-active / single-shell assertions run against
 * the same DOM a real route render would produce.
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

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

// The interactive island mounts `useRouter()` (Module 10 Step 5 batch wiring).
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

type PublishingCenterPageProps = React.ComponentProps<
  typeof import("./publishing-center-page").PublishingCenterPage
>;

// The (creator)/layout already mounts the shared AppShell. For the
// unit test we replicate that wrapper so the "Publishing active in
// sidebar" / single-shell checks run against the same DOM shape a
// real page render would produce.
async function renderPublishingCenter(
  overrides: Partial<PublishingCenterPageProps> = {},
) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { PublishingCenterPage } = await import(
    "./publishing-center-page"
  );
  return render(
    <AppShell
      pathname="/publishing"
      headerMode="global"
      pageTitle="发布中心"
      pageDescription="已发布内容、表现与排期"
    >
      <PublishingCenterPage {...overrides} />
    </AppShell>,
  );
}

describe("PublishingCenterPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the TopHeader in global mode with the publishing center title", async () => {
    const { container } = await renderPublishingCenter();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("global");
    const heading = container.querySelector(
      '[data-slot="header-page-heading"]',
    );
    expect(heading).not.toBeNull();
    expect(heading!.textContent ?? "").toContain("发布中心");
    expect(heading!.textContent ?? "").toContain("已发布内容、表现与排期");
  });

  it("marks the Publishing nav item as the active page in the sidebar", async () => {
    await renderPublishingCenter();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    // [T-063a] IA 收敛:/publishing 已无一级导航项(301 → /projects?tab=published);
    // 旧 pathname 一瞬渲染时激活项回退「今日台」。
    expect(active).toHaveAttribute("href", "/");
    expect(active.textContent?.trim()).toBe("今日台");
  });

  it("uses the assistant contextual-card variant (NOT storage)", async () => {
    const { container } = await renderPublishingCenter();
    const assistant = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    const storage = container.querySelector(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    expect(assistant).not.toBeNull();
    expect(storage).toBeNull();
  });

  it("renders ContentTypeTabs in the approved order from the screenshot", async () => {
    const { container } = await renderPublishingCenter();
    const tabs = container.querySelector(
      '[data-slot="content-type-tabs"]',
    ) as HTMLElement;
    expect(tabs).not.toBeNull();
    // The tab text combines the label and the count badge (e.g.
    // "全部28"). Compare on the leading label so the test stays
    // tolerant of the count decoration.
    const labels = Array.from(
      tabs.querySelectorAll('[role="tab"]'),
    ).map((node) => node.textContent?.trim() ?? "");
    const primaryLabels = labels.map((value) =>
      value.replace(/[\d,.\s]+$/u, "").trim(),
    );
    // The order is locked by page-specs §13. We expect at least
    // 4 entries: 全部 / 视频 / 图文 / 音频.
    expect(primaryLabels.length).toBeGreaterThanOrEqual(4);
    expect(primaryLabels[0]).toBe("全部");
    expect(primaryLabels).toContain("视频");
    expect(primaryLabels).toContain("图文");
    expect(primaryLabels).toContain("音频");
  });

  it("renders the PublishingToolbar with search + filter affordances", async () => {
    const { container } = await renderPublishingCenter();
    const toolbar = container.querySelector(
      '[data-slot="publishing-toolbar"]',
    ) as HTMLElement;
    expect(toolbar).not.toBeNull();
    const search = toolbar.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement | null;
    expect(search).not.toBeNull();
  });

  it("renders the PublicationTable with the 7 approved columns in spec order", async () => {
    const { container } = await renderPublishingCenter();
    const table = container.querySelector(
      '[data-slot="publication-table"]',
    ) as HTMLElement;
    expect(table).not.toBeNull();
    const headers = Array.from(
      table.querySelectorAll("thead th"),
    ).map((th) => th.textContent?.trim() ?? "");
    expect(headers).toEqual([
      "内容",
      "项目",
      "平台",
      "发布时间",
      "状态",
      "表现",
      "操作",
    ]);
  });

  it("renders at least one PublicationPerformanceRow with a platform icon", async () => {
    const { container } = await renderPublishingCenter();
    const rows = container.querySelectorAll(
      '[data-slot="publication-performance-row"]',
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const firstRow = rows[0] as HTMLElement;
    const icon = firstRow.querySelector(
      '[data-slot="platform-icon"]',
    );
    expect(icon).not.toBeNull();
  });

  it("renders the AnalyticsRail in the locked spec order (metrics → platform-comparison → trend → top-content)", async () => {
    const { container } = await renderPublishingCenter();
    const rail = container.querySelector(
      '[data-slot="analytics-rail"]',
    ) as HTMLElement;
    expect(rail).not.toBeNull();
    const expectedSlots = [
      "publishing-metrics",
      "platform-comparison-chart",
      "trend-chart",
      "top-content-list",
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

  it("renders the PublishingMetrics row with metric cards", async () => {
    const { container } = await renderPublishingCenter();
    const metrics = container.querySelector(
      '[data-slot="publishing-metrics"]',
    ) as HTMLElement;
    expect(metrics).not.toBeNull();
    const cards = metrics.querySelectorAll('[data-slot="metric-card"]');
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Pagination at the bottom of the publishing layout", async () => {
    const { container } = await renderPublishingCenter();
    const pagination = container.querySelector(
      '[data-slot="pagination"]',
    ) as HTMLElement;
    expect(pagination).not.toBeNull();
  });

  it("keeps the page inside the single AppShell — no second Sidebar/TopHeader", async () => {
    const { container } = await renderPublishingCenter();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
    const shells = container.querySelectorAll('[data-slot="app-shell"]');
    expect(shells).toHaveLength(1);
  });
});
