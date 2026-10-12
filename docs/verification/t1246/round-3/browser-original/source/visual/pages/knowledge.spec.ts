import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Knowledge & Memory page
 * (Task 19).
 *
 * The page is unit-tested in
 * `src/features/knowledge/knowledge-page.test.tsx`. This spec
 * exists to capture an updated screenshot of the knowledge route
 * once the dev server is running, so the visual regression
 * baseline can be updated via
 * `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- knowledge
 */

test.describe("Knowledge & Memory page", () => {
  test("renders the knowledge structure on the /knowledge route", async ({
    page,
  }) => {
    await page.goto("/knowledge");

    // TopHeader in global mode with the page title "知识库".
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("知识库");

    // The page must live inside exactly one AppShell — no second
    // Sidebar/TopHeader is created (D-002).
    const shells = page.locator('[data-slot="app-shell"]');
    await expect(shells).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The Knowledge nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/knowledge");

    // The main <main data-page="knowledge"> region exists exactly once.
    const main = page.locator('main[data-page="knowledge"]');
    await expect(main).toHaveCount(1);

    // KnowledgeToolbar (search input present).
    const toolbar = page.locator('[data-slot="knowledge-toolbar"]');
    await expect(toolbar).toBeVisible();
    await expect(
      toolbar.locator('input[type="search"]'),
    ).toBeVisible();

    // KnowledgeMetrics row: exactly FIVE MetricCard items in a single
    // row.
    const metrics = main.locator('[data-slot="knowledge-metrics"]');
    await expect(metrics).toBeVisible();
    await expect(
      metrics.locator('[data-slot="metric-card"]'),
    ).toHaveCount(5);

    // KnowledgeGrid: three columns in the spec order
    // CategoryPanel → RecentKnowledgeTable → InsightRail.
    const grid = main.locator('[data-slot="knowledge-grid"]');
    await expect(grid).toBeVisible();
    const categoryPanel = grid.locator(
      '[data-slot="category-panel"]',
    );
    const recentTable = grid.locator(
      '[data-slot="recent-knowledge-table-wrapper"]',
    );
    const insightRail = grid.locator('[data-slot="insight-rail"]');
    await expect(categoryPanel).toBeVisible();
    await expect(recentTable).toBeVisible();
    await expect(insightRail).toBeVisible();
    // Y-position order: Category < Recent < Insight.
    const categoryBox = await categoryPanel.boundingBox();
    const recentBox = await recentTable.boundingBox();
    const insightBox = await insightRail.boundingBox();
    expect(
      categoryBox && recentBox && insightBox &&
        categoryBox.x <= recentBox.x && recentBox.x <= insightBox.x,
    ).toBe(true);

    // InsightRail order: PopularTags → MemoryInsights →
    // UnsortedItems → ReusableSnippets.
    const rail = insightRail;
    const popularTags = rail.locator('[data-slot="popular-tags"]');
    const memoryInsights = rail.locator('[data-slot="memory-insights"]');
    const unsortedItems = rail.locator('[data-slot="unsorted-items"]');
    const snippets = rail.locator('[data-slot="reusable-snippets"]');
    for (const block of [popularTags, memoryInsights, unsortedItems, snippets]) {
      await expect(block).toBeVisible();
    }
    const popularY = (await popularTags.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const memoryY = (await memoryInsights.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const unsortedY = (await unsortedItems.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const snippetY = (await snippets.boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    expect(popularY <= memoryY && memoryY <= unsortedY && unsortedY <= snippetY).toBe(
      true,
    );

    // MemoryInsights block is NOT removed (page-specs §11 invariant).
    const memoryItems = rail.locator(
      '[data-slot="memory-insights"] [data-slot="memory-insight-item"]',
    );
    expect(await memoryItems.count()).toBeGreaterThanOrEqual(1);

    // PopularTags is a multi-row tag cloud (>= 4 chips).
    const chips = popularTags.locator('[data-slot="tag-chip"]');
    expect(await chips.count()).toBeGreaterThanOrEqual(4);

    // KnowledgeGraph stays on the same page (page-specs §11).
    const graph = main.locator('[data-slot="knowledge-graph"]');
    await expect(graph).toBeVisible();
    await expect(
      graph.locator('[data-slot="knowledge-graph-chart"]'),
    ).toBeVisible();
  });
});
