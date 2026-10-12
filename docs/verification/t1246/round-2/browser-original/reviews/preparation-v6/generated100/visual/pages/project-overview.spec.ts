import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Project Overview page (Task 12).
 *
 * The page is unit-tested in
 * `src/features/project-overview/project-overview-page.test.tsx`. This
 * spec exists to capture an updated screenshot of the production
 * route once the dev server is running, so the visual regression
 * baseline can be updated via
 * `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- project-overview
 */

test.describe("Project Overview page", () => {
  test("renders the project overview structure on the /projects/:projectId route", async ({
    page,
  }) => {
    await page.goto("/projects/project-ainativebrowser");

    // Page title surfaces the canonical project title.
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /AI Native Browser 深度解析/,
      }),
    ).toBeVisible();

    // The full-width progress card with the six-stage stepper.
    const progressCard = page.locator(
      '[data-slot="project-progress-card"]',
    );
    await expect(progressCard).toBeVisible();
    const stageItems = progressCard.locator(
      '[data-slot="project-stage-stepper"] [role="listitem"]',
    );
    await expect(stageItems).toHaveCount(6);
    await expect(progressCard.locator('[data-slot="progress-bar"]')).toHaveCount(
      1,
    );

    // The AssetSummaryCard renders exactly 5 stats.
    const assetCard = page.locator('[data-slot="asset-summary-card"]');
    await expect(assetCard).toBeVisible();
    await expect(assetCard.locator('[data-slot="asset-stat"]')).toHaveCount(5);

    // Recent files and project activity cards render as lists.
    await expect(
      page.locator('[data-slot="recent-files-card"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="recent-files-card"] [data-slot="recent-file-row"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="project-activity-card"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-slot="project-activity-card"] [data-slot="project-activity-row"]',
      ).first(),
    ).toBeVisible();

    // The four right-rail cards in spec order.
    for (const slot of [
      "project-info-card",
      "output-plan-card",
      "publishing-status-card",
      "milestone-card",
    ]) {
      await expect(
        page.locator(`[data-slot="project-overview-side-column"] [data-slot="${slot}"]`),
      ).toBeVisible();
    }

    // TopHeader in project-overview mode and Projects active in sidebar.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "project-overview");
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});
