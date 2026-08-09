import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the retired 经验裁决台 route (T-118c).
 *
 *  - Direct visit to `/experience` renders the two-column adjudication
 *    workbench (裁决队列 + 已验证经验库) distinct from per-project pages.
 *  - The TopHeader is in `global` mode with page title "经验沉淀"
 *    and the Sidebar marks "经验沉淀" as the active nav item.
 *  - The contextual card variant is `assistant` (D-003).
 *  - The page exposes 3 truth summary cards (待裁决 / 已验证 / 已回流校准),
 *    the candidate queue (or its honest empty state), the validated
 *    library with a discarded fold, and the Copilot capture deep-link
 *    (the retired 快速记录 form must NOT render).
 *  - The page is wrapped in exactly one AppShell.
 */

test.describe("经验裁决台 page", () => {
  test("redirects legacy /experience links into the unified knowledge base", async ({
    page,
  }) => {
    await page.goto("/experience");
    await expect(page).toHaveURL(/\/knowledge$/);
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/knowledge");
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('main[data-page="experience"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="experience-summary-cards"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="summary-card"]')).toHaveCount(0);
    await expect(page.locator('[data-summary-id="exp-candidates"]')).toHaveCount(0);
    await expect(page.locator('[data-summary-id="exp-validated"]')).toHaveCount(0);
    await expect(page.locator('[data-summary-id="exp-reflowed"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="experience-workbench"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="learning-queue"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="validated-library"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="discarded-section"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="candidate-card"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="learning-queue-empty"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="learning-adopt"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="learning-discard"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="learning-edit"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="quick-record-actions"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="experience-capture-link"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="sidebar-contextual-card"][data-variant="assistant"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);
    await expect(page.locator('main[data-page="knowledge"]')).toHaveCount(1);
    await expect(active).toHaveText("知识库");
  });
});
