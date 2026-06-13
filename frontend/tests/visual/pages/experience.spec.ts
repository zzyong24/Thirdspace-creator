import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Experience Center page
 * (Task 22).
 *
 * The page is unit-tested in
 * `src/features/experience/experience-page.test.tsx`. This spec
 * exists to capture an updated screenshot of the experience route
 * once the dev server is running, so the visual regression baseline
 * can be updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- experience
 */

test.describe("Experience Center page", () => {
  test("renders the experience center structure on the /experience route", async ({
    page,
  }) => {
    await page.goto("/experience");

    // TopHeader in global mode with the page title "经验沉淀".
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("经验沉淀");
    await expect(heading).toContainText("被验证的创作经验与失败案例");

    // The page must live inside exactly one AppShell — no second
    // Sidebar/TopHeader is created.
    const shells = page.locator('[data-slot="app-shell"]');
    await expect(shells).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The Experience nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/experience");

    // The contextual card variant is `assistant` (NOT `storage`).
    const assistant = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    await expect(assistant).toBeVisible();

    // The main <main data-page="experience"> region exists exactly once.
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

    // AISummarySection with 4 cards.
    const summary = main.locator('[data-slot="ai-summary-section"]');
    await expect(summary).toBeVisible();
    await expect(summary.locator('[data-slot="summary-card"]')).toHaveCount(4);

    // RecentDiscoveries + effect data column.
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

    // ExperienceCategories: 6 cards incl. failures.
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

    // RightRail order (asserted by DOM y-position).
    const rail = main.locator('[data-slot="experience-right-rail"]');
    await expect(rail).toBeVisible();
    const value = rail.locator('[data-slot="value-overview"]');
    const effect = rail.locator('[data-slot="application-effect-chart"]');
    const popular = rail.locator('[data-slot="popular-experience-list"]');
    const quick = rail.locator('[data-slot="quick-record-actions"]');
    for (const block of [value, effect, popular, quick]) {
      await expect(block).toBeVisible();
    }
    const yValue = (await value.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yEffect = (await effect.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yPopular = (await popular.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yQuick = (await quick.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    expect(yValue <= yEffect && yEffect <= yPopular && yPopular <= yQuick).toBe(
      true,
    );
  });
});