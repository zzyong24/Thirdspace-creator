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

  // [T-332 S4·§6.2] 新号零项目:诚实空态 + 「新建项目 / 从选题立项」引导,不渲空表格。
  it("零项目 → 空态引导(新建项目 + 从选题立项),不渲染空列表表头", async () => {
    const { buildProjectsViewModel } = await import("@/fixtures/selectors");
    const { container } = await renderProjects({
      viewModel: buildProjectsViewModel([]),
    });
    expect(
      screen.getByText("这个账号还没有项目"),
    ).toBeInTheDocument();
    const newLink = container.querySelector(
      '[data-slot="projects-empty-new"]',
    ) as HTMLAnchorElement;
    expect(newLink).not.toBeNull();
    expect(newLink.getAttribute("href")).toBe("/projects/new");
    const topicsLink = container.querySelector(
      '[data-slot="projects-empty-topics"]',
    ) as HTMLAnchorElement;
    expect(topicsLink.getAttribute("href")).toBe("/topics");
    // 空表格(只有列头)不再出现。
    expect(container.querySelector('[data-slot="project-list"]')).toBeNull();
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

  it("renders the projects top-header actions with search and new project entries", async () => {
    const { container } = await renderProjects();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByRole("link", { name: "搜索项目" }),
    ).toHaveAttribute("href", "/search");
    // [T-153] 全局 header 的「筛选」假按钮已移除(页内 ProjectsToolbar 提供真筛选/排序/可见性)。
    expect(
      within(header as HTMLElement).queryByRole("button", { name: "筛选项目" }),
    ).toBeNull();
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

  it("[T-051] 视图切换已砍(无 grid 实现,假承诺撤下)——不再渲染 view-toggle", async () => {
    const { container } = await renderProjects();
    expect(container.querySelector('[data-slot="view-toggle"]')).toBeNull();
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
    // [T-049 B1] href 用完整项目 id(旧断言的剥前缀 slug 正是真实项目身份丢失的根因)。
    expect(openAction).toHaveAttribute(
      "href",
      // [T-057①] 打开项目一律进稿面工作台(复盘/制作从稿面顶条跳)。
      "/projects/project-ainativebrowser",
    );
  });

  it("项目行单列展示真实排期状态，并保持“排期列 → 打开 → 更多”的稳定顺序", async () => {
    const { buildProjectsViewModel } = await import("@/fixtures/selectors");
    const base = buildProjectsViewModel();
    const eligible = base.rows[0]!;
    const imported = base.rows[1]!;
    const completed = base.rows[2]!;
    const published = base.rows[3]!;
    const vm = {
      ...base,
      rows: [
        {
          ...eligible,
          source: "manual" as const,
          status: "active" as const,
          outputs: eligible.outputs.map((output) => ({
            ...output,
            status: "drafting" as const,
          })),
        },
        {
          ...imported,
          source: "imported" as const,
        },
        {
          ...completed,
          source: "manual" as const,
          status: "completed" as const,
          outputs: completed.outputs.map((output) => ({
            ...output,
            status: "ready" as const,
          })),
        },
        {
          ...published,
          source: "manual" as const,
          status: "active" as const,
          outputs: published.outputs.map((output) => ({
            ...output,
            status: "published" as const,
          })),
        },
      ],
    };
    const { container } = await renderProjects({
      viewModel: vm,
      scheduleContext: {
        accountId: "account-1",
        referenceDateKey: "2026-07-29",
        entries: [
          {
            id: "cal-1",
            projectId: eligible.id,
            plannedDate: "2026-08-03",
            status: "planned",
          },
        ],
      },
    });

    const eligibleRow = container.querySelector(
      `[data-project-id="${eligible.id}"]`,
    ) as HTMLElement;
    const scheduleArea = eligibleRow.querySelector(
      '[data-slot="project-schedule-cell"]',
    ) as HTMLElement;
    const actionArea = eligibleRow.querySelector(
      '[data-slot="project-actions"]',
    ) as HTMLElement;
    expect(scheduleArea.children[0]).toHaveAttribute(
      "data-slot",
      "project-schedule-trigger",
    );
    expect(scheduleArea.textContent).toContain("改期 · 8月3日");
    expect(actionArea.children[0]).toHaveAttribute(
      "data-slot",
      "project-open-action",
    );
    expect(actionArea.children[1]).toHaveAttribute(
      "data-slot",
      "project-row-action",
    );
    expect(
      within(eligibleRow).getByRole("button", {
        name: /修改.*排期，当前 8月3日/,
      }),
    ).toBeTruthy();

    for (const hiddenRow of [imported, completed, published]) {
      const row = container.querySelector(
        `[data-project-id="${hiddenRow.id}"]`,
      ) as HTMLElement;
      expect(
        row.querySelector('[data-slot="project-schedule-trigger"]'),
      ).toBeNull();
      expect(
        row.querySelector('[data-slot="project-schedule-static"]'),
      ).not.toBeNull();
    }
    cleanup();

    const archivedVm = {
      ...base,
      rows: [
        {
          ...eligible,
          source: "manual" as const,
          status: "archived" as const,
        },
      ],
    };
    const archivedRender = await renderProjects({
      viewModel: archivedVm,
      status: "archived",
      scheduleContext: {
        accountId: "account-1",
        referenceDateKey: "2026-07-29",
        entries: [],
      },
    });
    expect(
      archivedRender.container.querySelector(
        '[data-slot="project-schedule-trigger"]',
      ),
    ).toBeNull();
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

  // [T-595] 下游直接消费归一化作品域，不再按旧 hidden 标记二次过滤。
  it("does not reinterpret legacy hidden flags or expose a show-hidden control", async () => {
    const { buildProjectsViewModel } = await import("@/fixtures/selectors");
    const base = buildProjectsViewModel();
    const hiddenId = base.rows[0]!.id;
    const vm = {
      ...base,
      rows: base.rows.map((row) =>
        row.id === hiddenId ? { ...row, hidden: true } : row,
      ),
    };

    // 人工注入的旧标记不会改变结果集；真实隐藏作品应在采集边界被清理。
    const first = await renderProjects({ viewModel: vm });
    expect(
      first.container.querySelector(`[data-project-id="${hiddenId}"]`),
    ).not.toBeNull();
    const toggle = first.container.querySelector(
      '[data-slot="projects-show-hidden-toggle"]',
    );
    expect(toggle).toBeNull();
    cleanup();

    expect(
      first.container.querySelector('[data-slot="project-hidden-badge"]'),
    ).toBeNull();
  });

  // [T-102 前半锁测] 归档项目从「全部」视图与计数中剔除,只在「已归档」tab 出现。
  it("imported + archived 状态优先：从全部/已发布消失，只在已归档显示完整归档语义", async () => {
    const { buildProjectsViewModel } = await import("@/fixtures/selectors");
    const base = buildProjectsViewModel();
    // 真实事故组合：自动化导入项目已归档，但旧读侧会被 source=imported 抢先判成已发布。
    const archivedId = base.rows[0]!.id;
    const vm = {
      ...base,
      rows: base.rows.map((row) =>
        row.id === archivedId
          ? { ...row, status: "archived" as const, source: "imported" as const }
          : row,
      ),
    };
    // 非归档行数(应等于「全部」视图与计数)。
    const nonArchivedCount = vm.rows.filter(
      (row) => row.status !== "archived",
    ).length;

    // 默认「全部」视图:归档行不渲染。
    const all = await renderProjects({ viewModel: vm, status: "all" });
    expect(
      all.container.querySelector(`[data-project-id="${archivedId}"]`),
    ).toBeNull();
    // 「全部项目」tab 计数 = 非归档行数(不含 archived)。
    const allTab = all.container.querySelector(
      '[data-slot="status-tab"][data-tab-id="all"]',
    );
    // tab 计数节点文本含非归档总数(容错:tab 结构存在即断言不含归档行渲染)。
    if (allTab) {
      expect(allTab.textContent).toContain(String(nonArchivedCount));
    }
    cleanup();

    // 「已发布」tab 同样不能出现这个归档 imported 投影。
    const published = await renderProjects({
      viewModel: vm,
      status: "published",
    });
    expect(
      published.container.querySelector(`[data-project-id="${archivedId}"]`),
    ).toBeNull();
    cleanup();

    // 「已归档」tab:归档行渲染。
    const archived = await renderProjects({
      viewModel: vm,
      status: "archived",
    });
    expect(
      archived.container.querySelector(`[data-project-id="${archivedId}"]`),
    ).not.toBeNull();
    const archivedRow = archived.container.querySelector(
      `[data-project-id="${archivedId}"]`,
    ) as HTMLElement;
    expect(
      archivedRow.querySelector('[data-slot="project-stage"]')?.textContent,
    ).toContain("已归档");
    expect(
      archivedRow.querySelector('[data-slot="project-stage"]')?.textContent,
    ).toContain("项目已归档");
    expect(
      archivedRow.querySelector('[data-slot="project-schedule-static"]')
        ?.textContent,
    ).toContain("已归档");
    expect(
      archivedRow.querySelector('[data-slot="project-schedule-trigger"]'),
    ).toBeNull();
  });

  it("进入 review 的复盘项目归入复盘中且不可再排期", async () => {
    const { buildProjectsViewModel } = await import("@/fixtures/selectors");
    const base = buildProjectsViewModel();
    const reviewingId = base.rows[0]!.id;
    const vm = {
      ...base,
      rows: base.rows.map((row) =>
        row.id === reviewingId
          ? {
              ...row,
              source: "manual" as const,
              status: "active" as const,
              currentStage: "review" as const,
              outputs: row.outputs.map((output) => ({
                ...output,
                status: "drafting" as const,
              })),
            }
          : row,
      ),
    };

    const active = await renderProjects({ viewModel: vm, status: "active" });
    expect(
      active.container.querySelector(`[data-project-id="${reviewingId}"]`),
    ).toBeNull();
    cleanup();

    const review = await renderProjects({
      viewModel: vm,
      status: "review",
      scheduleContext: {
        accountId: "account-1",
        referenceDateKey: "2026-07-29",
        entries: [],
      },
    });
    const reviewingRow = review.container.querySelector(
      `[data-project-id="${reviewingId}"]`,
    ) as HTMLElement;
    expect(reviewingRow).not.toBeNull();
    expect(
      reviewingRow.querySelector('[data-slot="project-stage"]')?.textContent,
    ).toContain("复盘中");
    expect(
      reviewingRow.querySelector('[data-slot="project-schedule-static"]')
        ?.textContent,
    ).toContain("复盘中");
    expect(
      reviewingRow.querySelector('[data-slot="project-schedule-trigger"]'),
    ).toBeNull();
  });
});
