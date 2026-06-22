import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Analytics & Review page
 * (Task 18).
 *
 * The page is unit-tested in
 * `src/features/review/analytics-review-page.test.tsx`. This spec
 * exists to capture an updated screenshot of the review route once
 * the dev server is running, so the visual regression baseline can
 * be updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- analytics-review
 */

test.describe("Analytics & Review page", () => {
  test("renders the analytics review structure on the /projects/:projectId/review route", async ({
    page,
  }) => {
    await page.goto("/projects/project-podcast-launch/review");

    // TopHeader in project-workspace mode with the canonical project
    // identity.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "project-workspace");
    const identity = page.locator(
      '[data-slot="header-project-identity"]',
    );
    await expect(identity).toContainText("Creator 访谈播客启动计划");

    // The six-stage stepper in canonical order with Review active.
    const stepperItems = page.locator(
      '[data-slot="header-stage-stepper"] li',
    );
    await expect(stepperItems).toHaveCount(6);
    const activeStage = page.locator(
      '[data-slot="header-stage-stepper"] [data-status="in_progress"]',
    );
    await expect(activeStage).toHaveCount(1);
    await expect(activeStage).toContainText("复盘");

    // AnalyticsTabs row.
    const tabs = page.locator('[data-slot="analytics-tabs"]');
    await expect(tabs).toBeVisible();

    // Main column blocks in spec order.
    const main = page.locator('[data-slot="analytics-main-column"]');
    await expect(main).toBeVisible();
    for (const slot of [
      "core-metrics-row",
      "primary-charts",
      "secondary-charts",
      "key-moments-section",
    ]) {
      await expect(main.locator(`[data-slot="${slot}"]`)).toBeVisible();
    }

    // Exactly 7 metric cards in the row.
    const cards = main.locator('[data-slot="core-metrics-row"] [data-slot="metric-card"]');
    await expect(cards).toHaveCount(7);

    // Primary charts: line + funnel.
    const trend = main.locator('[data-slot="views-trend-chart"]');
    await expect(trend).toBeVisible();
    await expect(trend).toHaveAttribute("data-shape", "line");
    const funnel = main.locator('[data-slot="conversion-funnel"]');
    await expect(funnel).toBeVisible();
    await expect(funnel).toHaveAttribute("data-shape", "funnel");

    // Secondary charts: donut + horizontal-bars + retention-curve.
    for (const slot of [
      "audience-profile",
      "audience-source",
      "retention-curve",
    ]) {
      const chart = main
        .locator('[data-slot="secondary-charts"]')
        .locator(`[data-slot="${slot}"]`);
      await expect(chart).toBeVisible();
    }
    await expect(
      main.locator('[data-slot="audience-profile"]'),
    ).toHaveAttribute("data-shape", "donut");
    await expect(
      main.locator('[data-slot="audience-source"]'),
    ).toHaveAttribute("data-shape", "horizontal-bars");
    await expect(
      main.locator('[data-slot="retention-curve"]'),
    ).toHaveAttribute("data-shape", "retention-curve");

    // Key moments list non-empty.
    const moments = main.locator(
      '[data-slot="key-moments-section"] [data-slot="key-moment-row"]',
    );
    expect(await moments.count()).toBeGreaterThanOrEqual(1);

    // Right rail: AI Analysis → Review History, in order.
    const rail = page.locator('[data-slot="analytics-right-rail"]');
    await expect(rail).toBeVisible();
    const aiCard = rail.locator('[data-slot="ai-analysis-card"]');
    const historyCard = rail.locator('[data-slot="review-history-card"]');
    await expect(aiCard).toBeVisible();
    await expect(historyCard).toBeVisible();
    const aiBox = await aiCard.boundingBox();
    const historyBox = await historyCard.boundingBox();
    expect(aiBox && historyBox && aiBox.y <= historyBox.y).toBe(true);

    // AI analysis is not an overlay: not in a dialog role.
    await expect(aiCard).not.toHaveAttribute("role", "dialog");
    await expect(aiCard).toHaveAttribute("data-overlay", "false");

    // Projects nav item remains active in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});
