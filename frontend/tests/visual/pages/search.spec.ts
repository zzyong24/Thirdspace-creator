import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Global Search page
 * (Task 23 / page-specs §15).
 *
 * The page is unit-tested in
 * `src/features/search/search-page.test.tsx`.
 * This spec exists to capture an updated screenshot of the
 * search route once the dev server is running, so the visual
 * regression baseline can be updated via
 * `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- search
 */

test.describe("Global Search page", () => {
  test("renders the global search structure on the /search route", async ({
    page,
  }) => {
    await page.goto("/search");

    // TopHeader in search mode with the global search field.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "search");
    await expect(page.locator('[data-slot="header-search"]')).toBeVisible();
    await expect(page.locator("#app-header-search")).toBeVisible();

    // The page must live inside exactly one AppShell — no second
    // Sidebar/TopHeader is created.
    const shells = page.locator('[data-slot="app-shell"]');
    await expect(shells).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The contextual card variant is `assistant` (D-003).
    const assistant = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    await expect(assistant).toBeVisible();

    // The main <main data-page="search"> region exists exactly once.
    const main = page.locator('main[data-page="search"]');
    await expect(main).toHaveCount(1);

    // ResultTypeTabs visible in approved order.
    const tabs = main.locator('[data-slot="result-type-tabs"]');
    await expect(tabs).toBeVisible();
    const tabLabels = await tabs
      .locator(
        '[role="tab"], [data-slot="result-type-tab"]',
      )
      .allTextContents();
    const cleaned = tabLabels.map((value) => value.trim()).filter(Boolean);
    expect(cleaned[0]).toBe("项目");
    expect(cleaned.indexOf("项目")).toBeLessThan(cleaned.indexOf("知识"));
    expect(cleaned.indexOf("知识")).toBeLessThan(cleaned.indexOf("素材"));
    expect(cleaned.indexOf("素材")).toBeLessThan(cleaned.indexOf("视频"));

    // ProjectResultSection: three cards.
    const projectSection = main.locator(
      '[data-slot="project-result-section"]',
    );
    await expect(projectSection).toBeVisible();
    const projectCards = projectSection.locator(
      '[data-slot="project-result-card"]',
    );
    await expect(projectCards).toHaveCount(3);

    // AssetResultSection + VideoResultSection: thumbnails visible.
    await expect(
      main.locator('[data-slot="asset-result-section"]'),
    ).toBeVisible();
    expect(
      await main
        .locator('[data-slot="asset-result-thumb"]')
        .count(),
    ).toBeGreaterThanOrEqual(2);
    await expect(
      main.locator('[data-slot="video-result-section"]'),
    ).toBeVisible();
    expect(
      await main
        .locator('[data-slot="video-result-thumb"]')
        .count(),
    ).toBeGreaterThanOrEqual(2);

    // SearchSideRail order: SearchFilters → QuickActions → History → Tips.
    const rail = main.locator('[data-slot="search-side-rail"]');
    await expect(rail).toBeVisible();
    const filters = rail.locator('[data-slot="search-filters"]');
    const quick = rail.locator('[data-slot="search-quick-actions"]');
    const history = rail.locator('[data-slot="search-history"]');
    const tips = rail.locator('[data-slot="search-tips"]');
    for (const block of [filters, quick, history, tips]) {
      await expect(block).toBeVisible();
    }
    const yFilters = (await filters.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yQuick = (await quick.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yHistory = (await history.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const yTips = (await tips.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    expect(
      yFilters <= yQuick && yQuick <= yHistory && yHistory <= yTips,
    ).toBe(true);
  });

  test("URL ?q=... is reflected in the search input value", async ({
    page,
  }) => {
    await page.goto("/search?q=AI");
    const main = page.locator('main[data-page="search"]');
    const input = main.locator('[data-slot="search-page-input"]');
    await expect(input).toHaveValue("AI");
  });
});
