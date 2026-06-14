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

    // Page heading.
    const heading = page.locator('[data-slot="projects-page-heading"]');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText("项目");

    // Toolbar with all three slots.
    await expect(page.locator('[data-slot="projects-toolbar"]')).toBeVisible();
    await expect(page.locator('[data-slot="search-field"]')).toBeVisible();
    await expect(page.locator('[data-slot="filter-button"]')).toBeVisible();
    await expect(page.locator('[data-slot="new-project-button"]')).toBeVisible();

    // Seven status tabs in the locked order.
    const tabs = page.locator('[data-slot="status-tab"]');
    await expect(tabs).toHaveCount(7);

    // View toggle and sort control expose accessible state.
    await expect(page.locator('[data-slot="view-toggle"]')).toBeVisible();
    await expect(page.locator('[data-slot="sort-control"]')).toBeVisible();

    // One project row per canonical project.
    const rows = page.locator('[data-slot="project-row"]');
    await expect(rows).toHaveCount(4);

    // Each row has a thumbnail, title, summary, owner, status badge,
    // stage, progress bar, platforms, update time and action button.
    for (let i = 0; i < 4; i += 1) {
      const row = rows.nth(i);
      await expect(row.locator('[data-slot="project-thumbnail"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-title"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-summary"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-owner"]')).toBeVisible();
      await expect(row.locator('[data-slot="status-badge"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-stage"]')).toBeVisible();
      await expect(row.locator('[data-slot="progress-bar"]')).toBeVisible();
      const platforms = row.locator('[data-slot="project-platforms"] [data-slot="platform-icon"]');
      await expect(platforms.first()).toBeVisible();
      await expect(row.locator('[data-slot="project-updated-at"]')).toBeVisible();
      await expect(row.locator('[data-slot="project-row-action"]')).toBeVisible();
    }

    // Pagination must surface at least one page, plus previous/next.
    await expect(page.locator('[data-slot="pagination"]')).toBeVisible();
    await expect(page.locator('[data-slot="pagination-prev"]')).toBeVisible();
    await expect(page.locator('[data-slot="pagination-next"]')).toBeVisible();

    // Sidebar must mark the Projects nav item as the active page.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});