import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the Projects page (Task 10).
 *
 *  - Direct visit to `/projects` renders the project list with the
 *    canonical number of rows,
 *  - the status tabs render with deterministic counts,
 *  - clicking the 新建项目 button routes to `/projects/new` and triggers
 *    the intercepting modal overlay from Task 8.
 */

test.describe("Projects page", () => {
  test("renders the projects list with status tabs and counts", async ({
    page,
  }) => {
    await page.goto("/projects");

    const main = page.locator('main[data-page="projects"]');
    await expect(main).toHaveCount(1);

    // Page heading lives inside the page content (slot-stable, not the
    // TopHeader) so the heading is found even when the layout header
    // does not surface a title.
    const heading = main.locator('[data-slot="projects-page-heading"]:visible');
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("项目");

    // Status tabs in the locked order.
    const tabs = main.locator('[data-slot="status-tab"]');
    await expect(tabs).toHaveCount(7);
    const expectedLabels = [
      "全部项目",
      "进行中",
      "写稿中",
      "制作中",
      "已发布",
      "复盘中",
      "已归档",
    ];
    for (let i = 0; i < expectedLabels.length; i += 1) {
      await expect(tabs.nth(i)).toHaveAttribute("data-tab-label", expectedLabels[i]!);
    }

    // Design-aligned counts shown by the fixture summary.
    await expect(
      main.locator('[data-slot="status-tab"][data-tab-id="all"] [data-testid="status-tab-count"]'),
    ).toHaveText("28");
    await expect(
      main.locator('[data-slot="status-tab"][data-tab-id="active"] [data-testid="status-tab-count"]'),
    ).toHaveText("12");

    // Header exposes search, filter and new project.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header.getByRole("link", { name: "搜索项目" })).toBeVisible();
    await expect(header.getByRole("button", { name: "筛选项目" })).toBeVisible();
    await expect(header.getByRole("link", { name: /新建项目/ })).toBeVisible();

    // View toggle and sort control.
    await expect(main.locator('[data-slot="view-toggle"]')).toBeVisible();
    await expect(main.locator('[data-slot="sort-control"]')).toBeVisible();

    // Project list with the six design-aligned first-page rows.
    const rows = main.locator('[data-slot="project-row"]');
    await expect(rows).toHaveCount(6);

    // Sidebar must mark the Projects nav item as the active page.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });

  test("clicking 新建项目 routes to /projects/new and opens the intercepting modal", async ({
    page,
  }) => {
    await page.goto("/projects");

    const newProjectLink = page.getByRole("link", { name: "新建项目" });
    await expect(newProjectLink).toHaveAttribute("href", "/projects/new");

    await newProjectLink.click();

    // Pathname becomes /projects/new (intercepting route from Task 8).
    await page.waitForURL("**/projects/new");
    expect(new URL(page.url()).pathname).toBe("/projects/new");

    // The intercepting overlay renders a dialog role.
    await expect(page.getByRole("dialog", { name: /新建项目/i })).toBeVisible();
  });

  test("clicking a project open action enters the current workspace", async ({
    page,
  }) => {
    await page.goto("/projects");

    const firstRow = page.locator(
      '[data-slot="project-row"][data-project-id="project-ainativebrowser"]',
    );
    await expect(firstRow).toBeVisible();
    await firstRow.getByRole("link", { name: "打开" }).click();

    await page.waitForURL("**/projects/ai-native-browser/script");
    expect(new URL(page.url()).pathname).toBe(
      "/projects/ai-native-browser/script",
    );
  });
});
