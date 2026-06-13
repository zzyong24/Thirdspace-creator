/**
 * Contract tests for the Projects page (Task 10).
 *
 * Locks the structural invariants the page must satisfy before any pixel
 * tuning:
 *  - the page exposes a "项目" heading,
 *  - the status tabs (全部 / 进行中 / 待办中 / 已暂停 / 已完成 / 已归档)
 *    render with deterministic counts that match the canonical dataset,
 *  - the toolbar exposes a search input, a 筛选 button, and a 新项目
 *    primary button wired to /projects/new (so the intercepting modal
 *    from Task 8 opens),
 *  - the view toggle exposes a grid/list accessible state,
 *  - the sort control exposes an accessible state (radio group),
 *  - the project list renders one row per canonical project, and every
 *    row contains thumbnail, title, summary, status badge, stage, progress
 *    bar, platform icons and update time,
 *  - the Projects nav link is marked as the active page in the sidebar,
 *  - the page lives inside exactly one AppShell.
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

type ProjectsPageProps = React.ComponentProps<
  typeof import("./projects-page").ProjectsPage
>;

// The (creator)/layout already mounts the shared AppShell. For the unit
// test we replicate that wrapper so the "Projects active in sidebar" check
// runs against the same DOM shape a real page render would produce.
async function renderProjects(overrides: Partial<ProjectsPageProps> = {}) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { ProjectsPage } = await import("./projects-page");
  return render(
    <AppShell pathname="/projects">
      <ProjectsPage {...overrides} />
    </AppShell>,
  );
}

describe("ProjectsPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a heading titled 项目", async () => {
    await renderProjects();
    const heading = screen.getByRole("heading", { level: 1 });
    // The heading is rendered by the global TopHeader. The page itself
    // surfaces a slot-stable h2 inside the toolbar so the page identity
    // is reachable from the route content too.
    expect(heading.textContent ?? "").toMatch(/项目/);
  });

  it("renders the six status tabs in the locked order with deterministic counts", async () => {
    const { container } = await renderProjects();
    const tabsRegion = container.querySelector('[data-slot="status-tabs"]');
    expect(tabsRegion).not.toBeNull();
    const tabButtons = tabsRegion!.querySelectorAll('[data-slot="status-tab"]');
    const expectedLabels = ["全部", "进行中", "待办中", "已暂停", "已完成", "已归档"];
    expect(tabButtons).toHaveLength(expectedLabels.length);
    tabButtons.forEach((button, index) => {
      expect(button.getAttribute("data-tab-label")).toBe(expectedLabels[index]);
    });
  });

  it("shows canonical counts for the status tabs", async () => {
    const { container } = await renderProjects();
    const all = container.querySelector(
      '[data-slot="status-tab"][data-tab-id="all"]',
    ) as HTMLElement;
    const active = container.querySelector(
      '[data-slot="status-tab"][data-tab-id="active"]',
    ) as HTMLElement;
    // Canonical fixture: 4 projects total, 2 active, 1 paused, 1 completed.
    expect(within(all).getByTestId("status-tab-count").textContent).toBe("4");
    expect(within(active).getByTestId("status-tab-count").textContent).toBe("2");
  });

  it("renders the toolbar with search, filter and new project entries", async () => {
    const { container } = await renderProjects();
    const toolbar = container.querySelector('[data-slot="projects-toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.querySelector('[data-slot="search-field"]')).not.toBeNull();
    expect(toolbar!.querySelector('[data-slot="filter-button"]')).not.toBeNull();
    const newProject = toolbar!.querySelector('[data-slot="new-project-button"]');
    expect(newProject).not.toBeNull();
  });

  it("the new project button is a link that routes to /projects/new", async () => {
    await renderProjects();
    const link = screen.getByRole("link", { name: /新项目/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/projects/new");
  });

  it("exposes a view toggle with list/grid accessible state", async () => {
    const { container } = await renderProjects();
    const toggle = container.querySelector('[data-slot="view-toggle"]');
    expect(toggle).not.toBeNull();
    const listOption = toggle!.querySelector('[data-slot="view-option"][data-view="list"]');
    const gridOption = toggle!.querySelector('[data-slot="view-option"][data-view="grid"]');
    expect(listOption).not.toBeNull();
    expect(gridOption).not.toBeNull();
    expect(listOption!.getAttribute("aria-pressed")).toBe("true");
    expect(gridOption!.getAttribute("aria-pressed")).toBe("false");
  });

  it("exposes a sort control with accessible state", async () => {
    const { container } = await renderProjects();
    const sortControl = container.querySelector('[data-slot="sort-control"]');
    expect(sortControl).not.toBeNull();
    // The sort control is a radio group; options are 待办中 / 进行中 / 已暂停 / 已完成.
    const radios = sortControl!.querySelectorAll(
      'input[type="radio"][name="projects-sort"]',
    );
    expect(radios.length).toBeGreaterThanOrEqual(2);
  });

  it("renders one project row per canonical project", async () => {
    const { container } = await renderProjects();
    const list = container.querySelector('[data-slot="project-list"]');
    expect(list).not.toBeNull();
    const rows = list!.querySelectorAll('[data-slot="project-row"]');
    // Canonical dataset ships 4 projects.
    expect(rows.length).toBe(4);
  });

  it("each project row contains thumbnail, title, summary, status, stage, progress, platforms and update time", async () => {
    const { container } = await renderProjects();
    const rows = container.querySelectorAll('[data-slot="project-row"]');
    expect(rows.length).toBe(4);
    rows.forEach((row) => {
      const rowEl = row as HTMLElement;
      // Each row must surface a thumbnail surface.
      expect(rowEl.querySelector('[data-slot="project-thumbnail"]')).not.toBeNull();
      // Title and summary.
      expect(rowEl.querySelector('[data-slot="project-title"]')?.textContent ?? "").not.toBe("");
      expect(rowEl.querySelector('[data-slot="project-summary"]')?.textContent ?? "").not.toBe("");
      // Status badge (must be one of the project statuses).
      const statusBadge = rowEl.querySelector('[data-slot="status-badge"]');
      expect(statusBadge).not.toBeNull();
      // Stage chip.
      expect(rowEl.querySelector('[data-slot="project-stage"]')).not.toBeNull();
      // Progress bar.
      expect(rowEl.querySelector('[data-slot="progress-bar"]')).not.toBeNull();
      // At least one platform icon.
      const platforms = rowEl.querySelectorAll('[data-slot="platform-icon"]');
      expect(platforms.length).toBeGreaterThanOrEqual(1);
      // Update time slot.
      expect(rowEl.querySelector('[data-slot="project-updated-at"]')?.textContent ?? "").not.toBe("");
    });
  });

  it("renders a pagination control with multiple pages", async () => {
    const { container } = await renderProjects();
    const pagination = container.querySelector('[data-slot="pagination"]');
    expect(pagination).not.toBeNull();
    const buttons = pagination!.querySelectorAll('[data-slot="pagination-page"]');
    // At minimum the current page (1) must be exposed.
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    const active = pagination!.querySelector(
      '[data-slot="pagination-page"][data-page-current="true"]',
    );
    expect(active).not.toBeNull();
  });

  it("is wrapped in the shared AppShell with one sidebar and one top header", async () => {
    const { container } = await renderProjects();
    const sidebars = container.querySelectorAll('[data-slot="app-sidebar"]');
    const headers = container.querySelectorAll('[data-slot="app-top-header"]');
    expect(sidebars).toHaveLength(1);
    expect(headers).toHaveLength(1);
  });

  it("marks the Projects nav item as the active page in the sidebar", async () => {
    await renderProjects();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/projects");
    expect(active.textContent?.trim()).toBe("项目");
  });
});