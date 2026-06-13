import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Research Workspace page
 * (Task 13).
 *
 * The page is unit-tested in
 * `src/features/research/research-workspace-page.test.tsx`. This spec
 * exists to capture an updated screenshot of the production route once
 * the dev server is running, so the visual regression baseline can be
 * updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- research
 */

test.describe("Research Workspace page", () => {
  test("renders the research workspace structure on the /projects/:projectId/research route", async ({
    page,
  }) => {
    await page.goto("/projects/project-ainativebrowser/research");

    // TopHeader in project-workspace mode and the canonical project
    // identity.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "project-workspace");
    const identity = page.locator(
      '[data-slot="header-project-identity"]',
    );
    await expect(identity).toContainText("AI Native Browser 深度解析");

    // Primary action "进入下一步:策划构思" lives in the header.
    await expect(
      header.getByRole("button", { name: /进入下一步:策划构思/ }),
    ).toBeVisible();

    // The six-stage stepper in canonical order.
    const stepperItems = page.locator(
      '[data-slot="header-stage-stepper"] li',
    );
    await expect(stepperItems).toHaveCount(6);

    // ProjectIdeaCard at the top of the Main column.
    await expect(
      page.locator('[data-slot="project-idea-card"]'),
    ).toBeVisible();

    // Three trend cards in the TrendBackgroundSection.
    const trendSection = page.locator(
      '[data-slot="trend-background-section"]',
    );
    await expect(trendSection).toBeVisible();
    await expect(
      trendSection.locator('[data-slot="research-summary-card"]'),
    ).toHaveCount(3);

    // CompetitorAnalysisTable with the locked column set.
    const competitorTable = page.locator(
      '[data-slot="competitor-analysis-table"]',
    );
    await expect(competitorTable).toBeVisible();
    const headerCells = competitorTable.locator("thead th");
    await expect(headerCells).toHaveText([
      "竞品名称",
      "平台",
      "定位",
      "优势",
      "劣势",
      "威胁等级",
    ]);
    await expect(
      competitorTable.locator('[data-slot="competitor-row"]'),
    ).toHaveCount(3);
    const threatBadges = competitorTable.locator(
      '[data-slot="competitor-threat"]',
    );
    expect(await threatBadges.count()).toBeGreaterThanOrEqual(2);

    // ResearchCollectionSection with TypeTabs in spec order.
    const collection = page.locator(
      '[data-slot="research-collection-section"]',
    );
    await expect(collection).toBeVisible();
    const tabIds = await collection
      .locator('[data-slot="page-tabs"] [data-tab-id]')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-tab-id")),
      );
    expect(tabIds).toEqual([
      "all",
      "article",
      "video",
      "report",
      "podcast",
    ]);
    const tabLabels = await collection
      .locator('[data-slot="page-tabs"] [data-tab-id]')
      .allTextContents();
    expect(tabLabels).toEqual(["全部", "文章", "视频", "报告", "播客"]);
    await expect(
      collection.locator('[data-slot="research-source-row"]').first(),
    ).toBeVisible();

    // Right rail with the three cards in spec order.
    for (const slot of [
      "research-notes-card",
      "evidence-collection-card",
      "related-tags-card",
    ]) {
      await expect(
        page.locator(`[data-slot="research-right-rail"] [data-slot="${slot}"]`),
      ).toBeVisible();
    }

    // Projects nav item remains active in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});