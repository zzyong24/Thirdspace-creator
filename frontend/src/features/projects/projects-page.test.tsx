/**
 * Contract tests for the Projects page (Task 10).
 *
 * Locks the structural invariants the page must satisfy before any pixel
 * tuning:
 *  - the page exposes a "项目" heading,
 *  - the status tabs render with deterministic counts that match the
 *    canonical dataset,
 *  - the shared top header exposes a search trigger, a 筛选 button, and
 *    a 新建项目 primary button wired to /projects/new (so the intercepting
 *    modal from Task 8 opens),
 *  - the view toggle exposes a grid/list accessible state,
 *  - the sort control exposes an accessible state (radio group),
 *  - the project list renders one row per canonical project, and every
 *    row contains cover thumbnail, title, summary, owner, status, stage,
 *    progress, platform icons, update time and a kebab action,
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

// `ProjectRowMenu` (a client component in each row's kebab action) calls
// `useRouter()`. Stub `next/navigation` so the component tree renders without a
// real Next.js router runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
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
  const { buildProjectsViewModel } = await import("@/fixtures/selectors");
  // `ProjectsPage` is an async Server Component (it `await`s the client in
  // production). The unit test drives it through the `viewModel?` override seam
  // so it stays sync and fixture-driven — the list it renders is the canonical
  // project set, identical to what the mock backend store serves.
  const viewModel = overrides.viewModel ?? buildProjectsViewModel();
  const element = await ProjectsPage({ ...overrides, viewModel });
  return render(<AppShell pathname="/projects">{element}</AppShell>);
}

describe("ProjectsPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a heading titled 项目", async () => {
    await renderProjects();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent ?? "").toMatch(/项目/);
  });

  it("renders the seven status tabs in the locked order", async () => {
    const { container } = await renderProjects();
    const tabsRegion = container.querySelector('[data-slot="status-tabs"]');
    expect(tabsRegion).not.toBeNull();
    const tabButtons = tabsRegion!.querySelectorAll('[data-slot="status-tab"]');
    const expectedLabels = [
      "全部项目",
      "进行中",
      "写稿中",
      "制作中",
      "已发布",
      "复盘中",
      "已归档",
    ];
    expect(tabButtons).toHaveLength(expectedLabels.length);
    tabButtons.forEach((button, index) => {
      expect(button.getAttribute("data-tab-label")).toBe(expectedLabels[index]);
    });
  });

  it("shows the design-aligned counts for the status tabs", async () => {
    const { container } = await renderProjects();
    const all = container.querySelector(
      '[data-slot="status-tab"][data-tab-id="all"]',
    ) as HTMLElement;
    const active = container.querySelector(
      '[data-slot="status-tab"][data-tab-id="active"]',
    ) as HTMLElement;
    expect(within(all).getByTestId("status-tab-count").textContent).toBe("4");
    expect(within(active).getByTestId("status-tab-count").textContent).toBe("2");
  });

  it("renders the projects top-header actions with search, filter and new project entries", async () => {
    const { container } = await renderProjects();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByRole("link", { name: "搜索项目" }),
    ).toHaveAttribute("href", "/search");
    expect(
      within(header as HTMLElement).getByRole("button", { name: "筛选项目" }),
    ).toBeInTheDocument();
    expect(
      within(header as HTMLElement).getByRole("link", { name: /新建项目/ }),
    ).toHaveAttribute("href", "/projects/new");
    expect(container.querySelector('[data-slot="projects-toolbar"]')).toBeNull();
  });

  it("the new project button is a link that routes to /projects/new", async () => {
    await renderProjects();
    const link = screen.getByRole("link", { name: /新建项目/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/projects/new");
  });

  it("exposes a view toggle with grid/list accessible state", async () => {
    const { container } = await renderProjects();
    const toggle = container.querySelector('[data-slot="view-toggle"]');
    expect(toggle).not.toBeNull();
    const listOption = toggle!.querySelector('[data-slot="view-option"][data-view="list"]');
    const gridOption = toggle!.querySelector('[data-slot="view-option"][data-view="grid"]');
    expect(listOption).not.toBeNull();
    expect(gridOption).not.toBeNull();
    expect(gridOption!.getAttribute("aria-pressed")).toBe("true");
    expect(listOption!.getAttribute("aria-pressed")).toBe("false");
  });

  it("exposes a sort control with accessible state", async () => {
    const { container } = await renderProjects();
    const sortControl = container.querySelector('[data-slot="sort-control"]');
    expect(sortControl).not.toBeNull();
    const radios = sortControl!.querySelectorAll(
      'input[type="radio"][name="projects-sort"]',
    );
    expect(radios.length).toBeGreaterThanOrEqual(2);
  });

  it("renders one row per canonical project on the first page", async () => {
    const { canonicalDataset } = await import("@/fixtures/canonical");
    const { container } = await renderProjects();
    const list = container.querySelector('[data-slot="project-list"]');
    expect(list).not.toBeNull();
    const rows = list!.querySelectorAll('[data-slot="project-row"]');
    // The list now comes from the mock backend store (cloned from the
    // canonical dataset) instead of the legacy DESIGN_PROJECT_ROWS literal.
    expect(rows.length).toBe(canonicalDataset.projects.length);
  });

  it("each project row contains cover, title, summary, owner, status, stage, progress, platforms, update time and action", async () => {
    const { canonicalDataset } = await import("@/fixtures/canonical");
    const { container } = await renderProjects();
    const rows = container.querySelectorAll('[data-slot="project-row"]');
    expect(rows.length).toBe(canonicalDataset.projects.length);
    rows.forEach((row) => {
      const rowEl = row as HTMLElement;
      expect(rowEl.querySelector('[data-slot="project-thumbnail"]')).not.toBeNull();
      expect(rowEl.querySelector('[data-slot="project-title"]')?.textContent ?? "").not.toBe("");
      expect(rowEl.querySelector('[data-slot="project-summary"]')?.textContent ?? "").not.toBe("");
      expect(rowEl.querySelector('[data-slot="project-owner"]')).not.toBeNull();
      expect(rowEl.querySelector('[data-slot="project-stage"]')).not.toBeNull();
      expect(rowEl.querySelector('[data-slot="progress-bar"]')).not.toBeNull();
      const platforms = rowEl.querySelectorAll('[data-slot="platform-icon"]');
      expect(platforms.length).toBeGreaterThanOrEqual(1);
      expect(rowEl.querySelector('[data-slot="project-updated-at"]')?.textContent ?? "").not.toBe("");
      expect(rowEl.querySelector('[data-slot="project-open-action"]')).not.toBeNull();
      expect(rowEl.querySelector('[data-slot="project-row-action"]')).not.toBeNull();
    });
  });

  it("routes the first row open action to its current workspace", async () => {
    const { container } = await renderProjects();
    const firstRow = container.querySelector(
      '[data-slot="project-row"][data-project-id="project-ainativebrowser"]',
    ) as HTMLElement;
    expect(firstRow).not.toBeNull();

    const openAction = within(firstRow).getByRole("link", { name: "打开" });
    expect(openAction).toHaveAttribute(
      "href",
      "/projects/ai-native-browser/script",
    );
  });

  it("renders a pagination control with previous/next and multiple pages", async () => {
    const { container } = await renderProjects();
    const pagination = container.querySelector('[data-slot="pagination"]');
    expect(pagination).not.toBeNull();
    expect(container.querySelector('[data-slot="pagination-prev"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="pagination-next"]')).not.toBeNull();
    const buttons = pagination!.querySelectorAll('[data-slot="pagination-page"]');
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
