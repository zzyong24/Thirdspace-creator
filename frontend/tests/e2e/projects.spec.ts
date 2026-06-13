import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the Projects page (Task 10).
 *
 *  - Direct visit to `/projects` renders the project list with the
 *    canonical number of rows,
 *  - the status tabs render with deterministic counts,
 *  - clicking the 新项目 button routes to `/projects/new` and triggers
 *    the intercepting modal overlay from Task 8.
 */

test.describe("Projects page", () => {
  test("renders the projects list with status tabs and counts", async ({
    page,
  }) => {
    await page.goto("/projects");

    // Page heading lives inside the page content (slot-stable, not the
    // TopHeader) so the heading is found even when the layout header
    // does not surface a title.
    const heading = page.locator('[data-slot="projects-page-heading"]');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("项目");

    // Status tabs in the locked order.
    const tabs = page.locator('[data-slot="status-tab"]');
    await expect(tabs).toHaveCount(6);
    const expectedLabels = ["全部", "进行中", "待办中", "已暂停", "已完成", "已归档"];
    for (let i = 0; i < expectedLabels.length; i += 1) {
      await expect(tabs.nth(i)).toHaveAttribute("data-tab-label", expectedLabels[i]!);
    }

    // Canonical counts: 全部 = 4, 进行中 = 2.
    await expect(
      page.locator('[data-slot="status-tab"][data-tab-id="all"] [data-testid="status-tab-count"]'),
    ).toHaveText("4");
    await expect(
      page.locator('[data-slot="status-tab"][data-tab-id="active"] [data-testid="status-tab-count"]'),
    ).toHaveText("2");

    // Toolbar exposes search, filter and new project.
    await expect(page.locator('[data-slot="search-field"]')).toBeVisible();
    await expect(page.locator('[data-slot="filter-button"]')).toBeVisible();
    await expect(page.locator('[data-slot="new-project-button"]')).toBeVisible();

    // View toggle and sort control.
    await expect(page.locator('[data-slot="view-toggle"]')).toBeVisible();
    await expect(page.locator('[data-slot="sort-control"]')).toBeVisible();

    // Project list with one row per canonical project.
    const rows = page.locator('[data-slot="project-row"]');
    await expect(rows).toHaveCount(4);

    // Sidebar must mark the Projects nav item as the active page.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });

  test("clicking 新项目 routes to /projects/new and opens the intercepting modal", async ({
    page,
  }) => {
    await page.goto("/projects");

    const newProjectLink = page.getByRole("link", { name: /新项目/ }).first();
    await expect(newProjectLink).toHaveAttribute("href", "/projects/new");

    await newProjectLink.click();

    // Pathname becomes /projects/new (intercepting route from Task 8).
    await page.waitForURL("**/projects/new");
    expect(new URL(page.url()).pathname).toBe("/projects/new");

    // The intercepting overlay renders a dialog role.
    await expect(page.getByRole("dialog", { name: /新建项目/i })).toBeVisible();
  });
});