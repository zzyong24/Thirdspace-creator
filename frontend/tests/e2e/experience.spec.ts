import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the Experience Center page (Task 22).
 *
 *  - Direct visit to `/experience` renders the global resource-center
 *    landing page distinct from the per-project pages.
 *  - The TopHeader is in `global` mode with page title "经验沉淀"
 *    and the Sidebar marks "经验沉淀" as the active nav item.
 *  - The contextual card variant is `assistant` (D-003).
 *  - The page exposes ExperienceTabs (7 tabs), AISummarySection
 *    (4 cards), RecentDiscoveries with effect data column,
 *    ExperienceCategories (6 cards including failures), and a
 *    RightRail in the locked spec order
 *      ValueOverview → ApplicationEffectChart →
 *      PopularExperienceList → QuickRecordActions.
 *  - The page is wrapped in exactly one AppShell.
 */

test.describe("Experience Center page", () => {
  test("renders the experience center structure on the /experience route", async ({
    page,
  }) => {
    await page.goto("/experience");

    // Header in global mode with the page title.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("经验沉淀");
    await expect(heading).toContainText("被验证的创作经验与失败案例");

    // The Experience nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/experience");

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
    const main = page.locator('main[data-page="experience"]');
    await expect(main).toHaveCount(1);

    // ExperienceTabs visible with 7 tabs in spec order.
    const tabs = main.locator('[data-slot="experience-tabs"]');
    await expect(tabs).toBeVisible();
    const tabLabels = await tabs.locator('[role="tab"]').allTextContents();
    expect(tabLabels.map((label) => label.trim())).toEqual([
      "全部",
      "选题策划",
      "脚本结构",
      "拍摄执行",
      "后期剪辑",
      "互动运营",
      "复盘沉淀",
    ]);

    // AISummarySection has 4 summary cards.
    const summary = main.locator('[data-slot="ai-summary-section"]');
    await expect(summary).toBeVisible();
    await expect(summary.locator('[data-slot="summary-card"]')).toHaveCount(4);

    // RecentDiscoveries with at least one discovery row and an
    // effect data column.
    const discoveries = main.locator('[data-slot="recent-discoveries"]');
    await expect(discoveries).toBeVisible();
    expect(
      await discoveries.locator('[data-slot="discovery-row"]').count(),
    ).toBeGreaterThanOrEqual(1);
    await expect(
      discoveries
        .locator('[data-slot="discovery-row"] [data-slot="discovery-effect-data"]')
        .first(),
    ).toBeVisible();

    // ExperienceCategories has 6 cards including failures.
    const categories = main.locator('[data-slot="experience-categories"]');
    await expect(categories).toBeVisible();
    await expect(
      categories.locator('[data-slot="experience-category-card"]'),
    ).toHaveCount(6);
    await expect(
      categories.locator(
        '[data-slot="experience-category-card"][data-category-id="experience-failures"]',
      ),
    ).toBeVisible();

    // RightRail block order.
    const rail = main.locator('[data-slot="experience-right-rail"]');
    await expect(rail).toBeVisible();
    for (const slot of [
      "value-overview",
      "application-effect-chart",
      "popular-experience-list",
      "quick-record-actions",
    ]) {
      await expect(rail.locator(`[data-slot="${slot}"]`)).toBeVisible();
    }
  });
});