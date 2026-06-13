import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Dashboard page (Task 9).
 *
 * The page is unit-tested in `src/features/dashboard/dashboard-page.test.tsx`.
 * This spec exists to capture an updated screenshot of the production
 * page once the dev server is running, so the visual regression
 * baseline can be updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- dashboard
 */

test.describe("Dashboard page", () => {
  test("renders the dashboard structure on the root route", async ({
    page,
  }) => {
    await page.goto("/");

    // Structural assertions mirror the unit-test contract.
    const summary = page.locator('[data-slot="dashboard-summary-metrics"]');
    await expect(summary).toBeVisible();
    await expect(summary.locator('[data-slot="metric-card"]')).toHaveCount(5);

    const grid = page.locator('[data-slot="dashboard-grid"]');
    await expect(grid).toBeVisible();
    for (const slot of [
      "continue-creating-card",
      "todo-card",
      "trending-topics-card",
      "recent-publications-card",
      "data-overview-card",
      "creation-suggestions-card",
    ]) {
      await expect(grid.locator(`[data-slot="${slot}"]`)).toBeVisible();
    }

    // The "新项目" entry must route to the intercepting modal route.
    const newProject = page.getByRole("link", { name: /新项目/ });
    await expect(newProject).toBeVisible();
    await expect(newProject).toHaveAttribute("href", "/projects/new");

    // Sidebar must mark the Home nav item as the active page.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/");
  });
});
