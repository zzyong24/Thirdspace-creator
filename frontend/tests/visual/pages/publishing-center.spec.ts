import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Publishing Center page
 * (Task 21).
 *
 * The page is unit-tested in
 * `src/features/publishing-center/publishing-center-page.test.tsx`.
 * This spec exists to capture an updated screenshot of the
 * publishing center route once the dev server is running, so the
 * visual regression baseline can be updated via
 * `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- publishing-center
 */

test.describe("Publishing Center page", () => {
  test("renders the publishing center structure on the /publishing route", async ({
    page,
  }) => {
    await page.goto("/publishing");

    // TopHeader in global mode with the page title "发布中心".
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("发布中心");
    await expect(heading).toContainText("已发布内容、表现与排期");

    // The page must live inside exactly one AppShell — no second
    // Sidebar/TopHeader is created.
    const shells = page.locator('[data-slot="app-shell"]');
    await expect(shells).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The Publishing nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/publishing");

    // The contextual card variant is `assistant` (NOT `storage`).
    const assistant = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    await expect(assistant).toBeVisible();

    // The main <main data-page="publishing-center"> region exists
    // exactly once.
    const main = page.locator('main[data-page="publishing-center"]');
    await expect(main).toHaveCount(1);

    // ContentTypeTabs visible.
    await expect(
      main.locator('[data-slot="content-type-tabs"]'),
    ).toBeVisible();

    // PublishingToolbar (search input).
    await expect(
      main.locator('[data-slot="publishing-toolbar"]'),
    ).toBeVisible();
    await expect(
      main.locator('[data-slot="publishing-toolbar"] input[type="search"]'),
    ).toBeVisible();

    // PublicationTable with 7 columns in spec order.
    const table = main.locator('[data-slot="publication-table"]');
    await expect(table).toBeVisible();
    const headers = await table.locator("thead th").allTextContents();
    expect(headers.map((h) => h.trim())).toEqual([
      "内容",
      "项目",
      "平台",
      "发布时间",
      "状态",
      "表现",
      "操作",
    ]);

    // Publication rows + at least one platform icon.
    const rows = main.locator(
      '[data-slot="publication-performance-row"]',
    );
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    await expect(
      main.locator('[data-slot="publication-performance-row"] [data-slot="platform-icon"]').first(),
    ).toBeVisible();

    // AnalyticsRail order.
    const rail = main.locator('[data-slot="analytics-rail"]');
    await expect(rail).toBeVisible();
    const metrics = rail.locator('[data-slot="publishing-metrics"]');
    const platformCmp = rail.locator(
      '[data-slot="platform-comparison-chart"]',
    );
    const trend = rail.locator('[data-slot="trend-chart"]');
    const top = rail.locator('[data-slot="top-content-list"]');
    for (const block of [metrics, platformCmp, trend, top]) {
      await expect(block).toBeVisible();
    }
    const yMetrics = (await metrics.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yPlatform = (await platformCmp.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yTrend = (await trend.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yTop = (await top.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    expect(yMetrics <= yPlatform && yPlatform <= yTrend && yTrend <= yTop).toBe(
      true,
    );

    // Pagination present.
    await expect(main.locator('[data-slot="pagination"]')).toBeVisible();
  });
});
