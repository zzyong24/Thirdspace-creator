/**
 * Contract tests for the Dashboard page (Task 9).
 *
 * Locks the structural invariants the page must satisfy before any pixel
 * tuning:
 *  - the page exposes a Welcome heading,
 *  - it renders exactly five MetricCard items in a single SummaryMetrics row,
 *  - it renders a three-column dashboard grid with six SectionCard regions
 *    in the order Continue, Todo, Trending, Publications, Data, Suggestions,
 *  - the "新项目" entry is a Link to /projects/new so it routes to the
 *    intercepting modal from Task 8,
 *  - it consumes `buildDashboardViewModel()` (data-driven, no hard-coded
 *    labels inside the page component).
 *
 * The component is a Server Component; the test wraps it in the shared
 * AppShell the same way `(creator)/layout.tsx` does so the "Home active in
 * sidebar" assertion is meaningful.
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

// Stub `next/navigation` so the NotificationPopover island (rendered inside the
// AppShell's TopHeader) can call `useRouter()` outside an App Router context
// (Module 01 G2). This test replicates the (creator) layout's AppShell wrapper;
// the popover's mutation path is not exercised here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// Stub `next/link` so we can assert href values without the Next.js
// runtime mounting a router.
vi.mock("next/link", () => ({
  useLinkStatus:()=>({pending:false}),
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

type DashboardPageProps = React.ComponentProps<
  typeof import("./dashboard-page").DashboardPage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Home active in sidebar" check
// runs against the same DOM shape a real page render would produce.
async function renderDashboard(overrides: Partial<DashboardPageProps> = {}) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { DashboardPage } = await import("./dashboard-page");
  const { buildDashboardViewModel } = await import("@/fixtures/selectors");
  // `DashboardPage` is an async Server Component (it `await`s the client in
  // production). The unit test drives it through the `viewModel?` override seam
  // with the fixture-composed view model — the same deterministic data the mock
  // backend serves — and resolves the component to a concrete element before
  // mounting it, so rendering stays synchronous and every assertion is intact.
  const viewModel = overrides.viewModel ?? buildDashboardViewModel();
  const element = await DashboardPage({ ...overrides, viewModel });
  return render(<AppShell pathname="/">{element}</AppShell>);
}

describe("DashboardPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a welcome heading greeting the current user", async () => {
    await renderDashboard();
    const heading = screen.getByRole("heading", { level: 1 });
    // The greeting text includes the user name. Loose match keeps the test
    // robust to small copy changes.
    expect(heading.textContent ?? "").toMatch(/早上好/);
  });

  it("greets the real account holder passed via greetingName, not the fixture", async () => {
    // Bug #1 regression: production passes the session user's displayName
    // (identity 中性化后 =「创作者」) through the `greetingName` seam. The
    // greeting must reflect THAT name, never the fixture "Zyong Zhu".
    await renderDashboard({ greetingName: "创作者" });
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent ?? "").toBe("早上好, 创作者!");
    expect(heading.textContent ?? "").not.toMatch(/Zyong/i);
  });

  it("renders exactly five metric cards in a single summary row", async () => {
    const { container } = await renderDashboard();
    const summary = container.querySelector(
      '[data-slot="dashboard-summary-metrics"]',
    );
    expect(summary).not.toBeNull();
    const metrics = summary!.querySelectorAll('[data-slot="metric-card"]');
    expect(metrics).toHaveLength(5);
  });

  it("renders the six grid cards in the locked order", async () => {
    const { container } = await renderDashboard();
    const grid = container.querySelector('[data-slot="dashboard-grid"]');
    expect(grid).not.toBeNull();
    // Each top-level grid card is tagged with a `data-slot` matching
    // its semantic role. The Data Overview card embeds a ChartFrame
    // which is itself a SectionCard, so we assert by slot name to
    // avoid counting the nested chart card.
    const cardSlots = [
      "continue-creating-card",
      "todo-card",
      "trending-topics-card",
      "recent-publications-card",
      "data-overview-card",
      "creation-suggestions-card",
    ];
    const orderedNodes = cardSlots.map((slot) =>
      grid!.querySelector(`[data-slot="${slot}"]`),
    );
    // All six must exist.
    expect(orderedNodes.every((node) => node !== null)).toBe(true);
    // The ordering must be: Continue, Todo, Trending, Publications,
    // Data, Suggestions. We compare the DOM source order of each
    // card against the order of the others using compareDocumentPosition.
    for (let i = 1; i < orderedNodes.length; i += 1) {
      const node = orderedNodes[i] as Element;
      const previous = orderedNodes[i - 1] as Element;
      // `previous` should come *before* `node` in document order.
      const relation = previous.compareDocumentPosition(node);
      expect(
        relation & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("continues creating card shows the active project progress", async () => {
    const { container } = await renderDashboard();
    const continueCard = container.querySelector(
      '[data-slot="continue-creating-card"]',
    ) as HTMLElement;
    expect(continueCard).toBeInTheDocument();
    // At least one progressbar is rendered for the active project.
    const progress = within(continueCard).getAllByRole("progressbar");
    expect(progress.length).toBeGreaterThanOrEqual(1);
  });

  it("the new project entry is a link that routes to /projects/new", async () => {
    await renderDashboard();
    const link = screen.getByRole("link", { name: /新项目/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/projects/new");
  });

  it("todo card lists the pending tasks with priority context", async () => {
    const { container } = await renderDashboard();
    const todoCard = container.querySelector(
      '[data-slot="todo-card"]',
    ) as HTMLElement;
    expect(todoCard).toBeInTheDocument();
    // The todo card must render at least one todo row.
    const rows = todoCard.querySelectorAll('[data-slot="todo-row"]');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("each todo row deep-links to its project", async () => {
    const { container } = await renderDashboard();
    const todoCard = container.querySelector(
      '[data-slot="todo-card"]',
    ) as HTMLElement;
    const links = todoCard.querySelectorAll<HTMLAnchorElement>(
      'a[data-slot="todo-row-link"]',
    );
    // There is at least one actionable row and every row links into /projects/.
    expect(links.length).toBeGreaterThanOrEqual(1);
    for (const link of Array.from(links)) {
      expect(link.getAttribute("href") ?? "").toMatch(/^\/projects\/[^/]+/);
    }
  });

  it("trending topics card shows heat labels", async () => {
    const { container } = await renderDashboard();
    const trending = container.querySelector(
      '[data-slot="trending-topics-card"]',
    ) as HTMLElement;
    // The trending topics card must be present; the selector uses the
    // canonical dataset so we just assert the region is rendered with a
    // title and a non-empty body.
    expect(trending).toBeInTheDocument();
    expect(trending.textContent ?? "").not.toBe("");
  });

  it("trending topics card exposes a card-level action to the topic pool", async () => {
    const { container } = await renderDashboard();
    const trending = container.querySelector(
      '[data-slot="trending-topics-card"]',
    ) as HTMLElement;
    const action = trending.querySelector<HTMLAnchorElement>(
      'a[data-slot="trending-topics-action"]',
    );
    expect(action).not.toBeNull();
    expect(action).toHaveAttribute("href", "/topics");
  });

  it("each creation suggestion exposes a one-click CTA to a real route", async () => {
    const { container } = await renderDashboard();
    const suggestionsCard = container.querySelector(
      '[data-slot="creation-suggestions-card"]',
    ) as HTMLElement;
    const ctas = suggestionsCard.querySelectorAll<HTMLAnchorElement>(
      'a[data-slot="suggestion-cta"]',
    );
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    // Every CTA targets a real surface: the topic pool, a project stage, or
    // the new-project overlay.
    for (const cta of Array.from(ctas)) {
      expect(cta.getAttribute("href") ?? "").toMatch(
        /^\/topics$|^\/projects\/[^/]+(\/[a-z]+)?$|^\/projects\/new$/,
      );
    }
  });

  it("data overview card renders a chart frame with a textual summary", async () => {
    const { container } = await renderDashboard();
    const dataCard = container.querySelector(
      '[data-slot="data-overview-card"]',
    ) as HTMLElement;
    const figure = within(dataCard).getByRole("figure");
    expect(figure).toBeInTheDocument();
    // D-007: charts must expose a textual summary for assistive tech.
    const summary = dataCard.querySelector('[data-slot="chart-frame-summary"]');
    expect(summary).not.toBeNull();
  });

  it("is wrapped in the shared AppShell with one sidebar and one top header", async () => {
    const { container } = await renderDashboard();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
  });

  it("marks the Home nav item as the active page in the sidebar", async () => {
    await renderDashboard();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/");
    expect(active.textContent?.trim()).toBe("首页");
  });

  // [FE-M04] 副标题聚合真实待办;有待办时不谎报「全部处理完」。
  it("有待办但无建议时,副标题反映真实待办,不谎报「所有任务都已处理完」", async () => {
    const { buildDashboardViewModel } = await import("@/fixtures/selectors");
    const base = buildDashboardViewModel();
    // todos 非空(fixture 有),suggestions 置空 —— 命中原 bug 场景。
    const viewModel = { ...base, suggestions: [] };
    expect(viewModel.todos.length).toBeGreaterThan(0);
    const { container } = await renderDashboard({ viewModel });
    const subtext = container.querySelector('[data-slot="dashboard-subtext"]');
    expect(subtext).not.toBeNull();
    expect(subtext!.textContent ?? "").toContain("待办");
    expect(subtext!.textContent ?? "").not.toContain("处理完");
  });

  it("待办与建议都为空时,副标题诚实显示「暂无」,不伪造", async () => {
    const { buildDashboardViewModel } = await import("@/fixtures/selectors");
    const base = buildDashboardViewModel();
    const viewModel = { ...base, todos: [], suggestions: [] };
    const { container } = await renderDashboard({ viewModel });
    const subtext = container.querySelector('[data-slot="dashboard-subtext"]');
    expect(subtext!.textContent ?? "").toContain("暂无");
  });

  // [FE-M04] 缺平台值显示「未设置」,不伪造「多平台」。
  it("继续创作项目无目标平台时显示「未设置」而非伪造的「多平台」", async () => {
    const { buildDashboardViewModel } = await import("@/fixtures/selectors");
    const base = buildDashboardViewModel();
    const viewModel = {
      ...base,
      continueCreating: {
        heading: "继续创作",
        projectId: "no-such-project-xyz",
        projectTitle: "无平台真项目",
        stage: "script" as const,
        progressPct: 40,
        updatedAt: "2026-07-15T00:00:00+08:00",
      },
    };
    const { container } = await renderDashboard({ viewModel });
    const card = container.querySelector(
      '[data-slot="continue-creating-card"]',
    ) as HTMLElement;
    expect(card.textContent ?? "").toContain("未设置");
    expect(card.textContent ?? "").not.toContain("多平台");
  });
});

// [T-348] 0 号(未绑号)首页降级:page.tsx catch AccountRequiredError → zeroAccountDashboardViewModel。
// 锁住「dashboard 0 号不崩」——用该空 VM 渲染 DashboardPage,5 张占位指标齐、各卡走诚实空态,不报错。
describe("[T-348] DashboardPage — 0 号降级(未绑号,诚实空态)", () => {
  afterEach(() => {
    cleanup();
  });

  it("用 zeroAccountDashboardViewModel 渲染:5 张占位指标 + 各卡诚实空态,不崩", async () => {
    const { zeroAccountDashboardViewModel } = await import(
      "./zero-account-dashboard"
    );
    const viewModel = zeroAccountDashboardViewModel();
    expect(viewModel.scheduleReminderReadState).toEqual({
      state: "ready",
      error: null,
    });
    const { container } = await renderDashboard({
      viewModel,
    });
    // 顶部一排仍是 5 张指标(占位「—」)。
    const summary = container.querySelector(
      '[data-slot="dashboard-summary-metrics"]',
    );
    expect(summary!.querySelectorAll('[data-slot="metric-card"]')).toHaveLength(
      5,
    );
    expect(summary!.textContent ?? "").toContain("—"); // 占位值,不伪造 0 播放
    // 继续创作 / 热门选题 / 创作建议 / 数据概览 全走诚实空态(不摆演示假数据)。
    expect(
      container.querySelector('[data-slot="continue-creating-empty"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="trending-topics-empty"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="creation-suggestions-empty"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="data-overview-empty"]'),
    ).not.toBeNull();
  });
});

it("首页提供真实运营日报路由",async()=>{await renderDashboard();expect(screen.getByRole("link",{name:/运营日报/})).toHaveAttribute("href","/daily-report");});
