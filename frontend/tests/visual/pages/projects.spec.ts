import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Projects page (Task 10).
 *
 * The page is unit-tested in `src/features/projects/projects-page.test.tsx`
 * and e2e-tested in `tests/e2e/projects.spec.ts`. This spec exists to
 * capture an updated screenshot of the production page once the dev
 * server is running, so the visual regression baseline can be updated
 * via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- projects
 */

test.describe("Projects page", () => {
  test("renders the projects structure on the /projects route", async ({
    page,
  }) => {
    await page.goto("/projects");
    const main = page.locator('main[data-page="projects"]');
    await expect(main).toHaveCount(1);

    // Page heading.
    const heading = main.locator('[data-slot="projects-page-heading"]:visible');
    await expect(heading).toHaveCount(1);
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("项目");

    // Header with all three project actions.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header.getByRole("link", { name: "搜索项目" })).toBeVisible();
    await expect(header.getByRole("button", { name: "筛选项目" })).toBeVisible();
    await expect(header.getByRole("link", { name: /新建项目/ })).toBeVisible();

    // Seven status tabs in the locked order.
    const tabs = main.locator('[data-slot="status-tab"]');
    await expect(tabs).toHaveCount(7);

    // View toggle and sort control expose accessible state.
    await expect(main.locator('[data-slot="view-toggle"]')).toBeVisible();
    await expect(main.locator('[data-slot="sort-control"]')).toBeVisible();

    // Six design-aligned project rows.
    const rows = main.locator('[data-slot="project-row"]');
    await expect(rows).toHaveCount(6);

    // Each row has a thumbnail, title, summary, owner,
    // stage, progress bar, platforms, update time and action button.
    for (let i = 0; i < 6; i += 1) {
      const row = rows.nth(i);
      await expect(row.locator('[data-slot="project-thumbnail"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-title"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-summary"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-owner"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-stage"]')).toBeVisible();
      await expect(row.locator('[data-slot="progress-bar"]')).toBeVisible();
      const platforms = row.locator('[data-slot="project-platforms"] [data-slot="platform-icon"]');
      await expect(platforms.first()).toBeVisible();
      await expect(row.locator('[data-slot="project-updated-at"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-row-action"]')).toBeVisible();
    }

    // Pagination must surface at least one page, plus previous/next.
    await expect(main.locator('[data-slot="pagination"]')).toBeVisible();
    await expect(main.locator('[data-slot="pagination-prev"]')).toBeVisible();
    await expect(main.locator('[data-slot="pagination-next"]')).toBeVisible();

    // Sidebar must mark the Projects nav item as the active page.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});
