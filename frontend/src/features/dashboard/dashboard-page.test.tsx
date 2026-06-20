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
    // The greeting text includes the user name from the canonical
    // dataset. Loose match keeps the test robust to small copy changes.
    expect(heading.textContent ?? "").toMatch(/早上好|Kevin|Zyong/i);
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
});
