import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the 今日台 page (T-063b).
 *
 * The page is unit-tested in `src/features/dashboard/dashboard-page.test.tsx`.
 * This spec exists to capture an updated screenshot of the production
 * page once the dev server is running, so the visual regression
 * baseline can be updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- dashboard
 */

test.describe("今日台 page", () => {
  test("renders the action-queue structure on the root route", async ({
    page,
  }) => {
    await page.goto("/");

    // 主体:行动队列(有数据渲行,全空渲引导空态 —— 二者必居其一,绝不空白)。
    const queue = page.locator('[data-slot="today-queue"]');
    await expect(queue).toBeVisible();
    const rows = queue.locator('[data-slot="today-action"]');
    const empty = queue.locator('[data-slot="today-queue-empty"]');
    expect((await rows.count()) > 0 || (await empty.count()) === 1).toBe(true);

    // 每行带 data-kind(六类源之一)+ 深链 [gate-F2]。
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute(
        "data-kind",
        /^(project|candidate|learning|calibration|publish|signal)$/,
      );
      const href =
        (await row
          .locator('a[data-slot="today-action-link"]')
          .getAttribute("href")) ?? "";
      expect(href.length).toBeGreaterThan(0);
    }

    // 保留件:一条真值趋势行 + 继续创作卡。
    await expect(
      page.locator('[data-slot="dashboard-trend-line"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="continue-creating-card"]'),
    ).toBeVisible();

    // 移除件:旧路标卡不再渲染。
    for (const slot of [
      "dashboard-summary-metrics",
      "trending-topics-card",
      "recent-publications-card",
      "data-overview-card",
      "creation-suggestions-card",
    ]) {
      await expect(page.locator(`[data-slot="${slot}"]`)).toHaveCount(0);
    }

    // The "新项目" entry must route to the intercepting modal route.
    const newProject = page.getByRole("link", { name: "＋ 新项目" });
    await expect(newProject).toBeVisible();
    await expect(newProject).toHaveAttribute("href", "/projects/new");

    // Sidebar must mark the 今日台 nav item as the active page.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/");
  });
});
