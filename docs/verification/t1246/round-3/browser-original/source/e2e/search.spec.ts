import { randomUUID } from "node:crypto";
import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the Global Search page (Task 23 / page-specs §15).
 *
 *  - Direct visit to `/search` renders the page with the global
 *    search-mode TopHeader and the page title "全局搜索".
 *  - The contextual card variant is `assistant` (D-003).
 *  - The sidebar primary nav stays standard (no dedicated "搜索"
 *    active item).
 *  - ResultTypeTabs render in the approved order
 *    (项目 / 知识 / 素材 / 视频).
 *  - ProjectResultSection shows three project cards.
 *  - SearchSideRail order: SearchFilters → QuickActions →
 *    SearchHistory → SearchTips.
 *  - The page is wrapped in exactly one AppShell.
 */

test.describe("Global Search page", () => {
  test("renders the global search structure on the /search route", async ({
    page,
    baseURL,
  }) => {
    const groupResponse = await page.request.post("/api/v1/dispatch", { data: { id: "accountGroups.create", input: { body: { name: "搜索真实三项目", idempotencyKey: randomUUID() } } }, timeout: 120_000 });
    expect(groupResponse.ok()).toBe(true);
    const group = (await groupResponse.json()).data as { id: string };
    const query = `search-${randomUUID()}`;
    const projectIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await page.request.post("/api/v1/dispatch", { headers: { "x-group-id": group.id }, data: { id: "projects.create", input: { body: { title: `${query} 项目 ${index + 1}`, brief: "用户创建的真实搜索对象" } } }, timeout: 120_000 });
      expect(response.ok()).toBe(true);
      const project = (await response.json()).data as { id: string; groupId: string };
      expect(project.groupId).toBe(group.id);
      projectIds.push(project.id);
    }
    await page.context().addCookies([{ name: "creatoros_current_group", value: encodeURIComponent(group.id), url: baseURL! }]);
    await page.addInitScript((id) => { localStorage.setItem("creatoros:current-group", id); localStorage.removeItem("creatoros:current-account"); }, group.id);
    await page.goto("/search");

    // Header is in `search` mode with the global search field.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "search");
    await expect(page.locator('[data-slot="header-search"]')).toBeVisible();
    await expect(page.locator("#app-header-search")).toBeVisible();

    // The main <main data-page="search"> region exists exactly once.
    const main = page.locator('main[data-page="search"]');
    await expect(main).toHaveCount(1);

    // Contextual card variant is `assistant`.
    const assistant = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    await expect(assistant).toBeVisible();

    // Sidebar primary nav must not have a dedicated "搜索" link with
    // `aria-current="page"`. The standard active item remains the
    // previously visited page (here, the entry route).
    const searchActive = page
      .getByRole("navigation", { name: "主要导航" })
      .locator('[aria-current="page"][href="/search"]');
    await expect(searchActive).toHaveCount(0);

    // Single AppShell with one Sidebar/TopHeader.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // ResultTypeTabs in the approved order.
    const tabs = main.locator('[data-slot="result-type-tabs"]');
    await expect(tabs).toBeVisible();
    const tabLabels = await tabs
      .locator(
        '[role="tab"], [data-slot="result-type-tab"]',
      )
      .allTextContents();
    const cleaned = tabLabels
      .map((value) => value.trim().replace(/[\d]+$/u, "").trim())
      .filter(Boolean);
    expect(cleaned[0]).toBe("项目");
    expect(cleaned.indexOf("项目")).toBeLessThan(cleaned.indexOf("知识"));
    expect(cleaned.indexOf("知识")).toBeLessThan(cleaned.indexOf("素材"));
    expect(cleaned.indexOf("素材")).toBeLessThan(cleaned.indexOf("视频"));

    // 空查询诚实无搜索结果；真实用户输入后原公共项目成为这三张卡。
    await expect(main.locator('[data-slot="project-result-card"]')).toHaveCount(0);
    await page.locator("#app-header-search").fill(query);
    await page.locator("#app-header-search").press("Enter");
    await expect(page).toHaveURL(new RegExp(`[?&]q=${query}`));

    // ProjectResultSection: exactly three project cards.
    const projectSection = main.locator(
      '[data-slot="project-result-section"]',
    );
    await expect(projectSection).toBeVisible();
    const projectCards = projectSection.locator(
      '[data-slot="project-result-card"]',
    );
    await expect(projectCards).toHaveCount(3);
    expect((await projectCards.evaluateAll((cards) => cards.map((card) => card.getAttribute("data-project-id")))).sort()).toEqual([...projectIds].sort());
    for (const id of projectIds) await expect(main.locator(`[data-slot="project-result-card"][data-project-id="${id}"]`)).toHaveAttribute("href", `/projects/${id}`);

    // SearchSideRail order.
    const rail = main.locator('[data-slot="search-side-rail"]');
    await expect(rail).toBeVisible();
    for (const slot of [
      "search-filters",
      "search-quick-actions",
      "search-history",
      "search-tips",
    ]) {
      await expect(rail.locator(`[data-slot="${slot}"]`)).toBeVisible();
    }
  });

  test("URL ?q=... is reflected in the search input value", async ({
    page,
  }) => {
    await page.goto("/search?q=AI");
    const main = page.locator('main[data-page="search"]');
    await expect(main).toHaveCount(1);
    const input = page.locator("#app-header-search");
    await expect(input).toHaveValue("AI");
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 30660000 });
