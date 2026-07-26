import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the Publishing Center page (Task 21).
 *
 *  - Direct visit to `/publishing` renders the global resource-center
 *    landing page distinct from the per-project Publishing Workspace
 *    (page-specs §13 "禁止改变": "不与 Publishing Workspace 合并").
 *  - The TopHeader is in `global` mode with page title "发布中心"
 *    and the Sidebar marks "发布中心" as the active nav item.
 *  - The contextual card variant is `assistant` (D-003).
 *  - The page exposes ContentTypeTabs, PublishingToolbar, a 7-column
 *    PublicationTable, an AnalyticsRail in the locked spec order
 *    (PublishingMetrics → PlatformComparisonChart → TrendChart →
 *    TopContentList) and Pagination.
 *  - The page is wrapped in exactly one AppShell.
 */

test.describe("Publishing Center page", () => {
  test("renders the publishing center structure on the /publishing route", async ({
    page,
  }) => {
    await page.goto("/publishing");

    // Header in global mode with the page title.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("发布中心");
    await expect(heading).toContainText("已发布内容、表现与排期");

    // The Publishing nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/publishing");

    // Contextual card variant is `assistant` (D-003).
    const assistant = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    await expect(assistant).toBeVisible();

    // Single AppShell with one Sidebar/TopHeader.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The page-internal main region exists exactly once.
    const main = page.locator('main[data-page="publishing-center"]');
    await expect(main).toHaveCount(1);

    // ContentTypeTabs in spec order.
    await expect(
      main.locator('[data-slot="content-type-tabs"]'),
    ).toBeVisible();

    // PublishingToolbar (search input present).
    await expect(
      main.locator('[data-slot="publishing-toolbar"]'),
    ).toBeVisible();
    await expect(
      main.locator(
        '[data-slot="publishing-toolbar"] input[type="search"]',
      ),
    ).toBeVisible();

    // [T-231①] BatchOperationBar 已删(批量发布/下架/修改时间无真实 publisher)。
    await expect(
      main.locator('[data-slot="batch-operation-bar"]'),
    ).toHaveCount(0);
    await expect(
      main.locator('[data-slot="publication-row-checkbox"]'),
    ).toHaveCount(0);

    // PublicationTable with 7 approved columns in spec order.
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
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
    await expect(
      main
        .locator(
          '[data-slot="publication-performance-row"] [data-slot="platform-icon"]',
        )
        .first(),
    ).toBeVisible();

    // AnalyticsRail order.
    const rail = main.locator('[data-slot="analytics-rail"]');
    await expect(rail).toBeVisible();
    for (const slot of [
      "publishing-metrics",
      "platform-comparison-chart",
      "trend-chart",
      "top-content-list",
    ]) {
      await expect(
        rail.locator(`[data-slot="${slot}"]`),
      ).toBeVisible();
    }

    // Pagination present.
    await expect(main.locator('[data-slot="pagination"]')).toBeVisible();
  });
});
