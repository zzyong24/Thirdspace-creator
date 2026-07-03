import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the 经验裁决台 page (T-062a · SPEC 2026-07-03 §2.1).
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
  test("renders the adjudication workbench on the /experience route", async ({
    page,
  }) => {
    await page.goto("/experience");

    // Header in global mode with the page title.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("经验沉淀");

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

    // 3 truth summary cards in spec order.
    const summary = main.locator('[data-slot="experience-summary-cards"]');
    await expect(summary).toBeVisible();
    await expect(summary.locator('[data-slot="summary-card"]')).toHaveCount(3);
    await expect(
      summary.locator('[data-summary-id="exp-candidates"]'),
    ).toContainText("待裁决");
    await expect(
      summary.locator('[data-summary-id="exp-validated"]'),
    ).toContainText("已验证");
    await expect(
      summary.locator('[data-summary-id="exp-reflowed"]'),
    ).toContainText("已回流校准");

    // Two-column workbench: 裁决队列 + 已验证库 (with the discarded fold).
    const workbench = main.locator('[data-slot="experience-workbench"]');
    await expect(workbench).toBeVisible();
    await expect(
      workbench.locator('[data-slot="learning-queue"]'),
    ).toBeVisible();
    await expect(
      workbench.locator('[data-slot="validated-library"]'),
    ).toBeVisible();
    await expect(
      workbench.locator('[data-slot="discarded-section"]'),
    ).toBeVisible();

    // Honest queue: either real candidate cards or the empty-state copy —
    // never fixture rows.
    const queue = workbench.locator('[data-slot="learning-queue"]');
    const candidateCount = await queue
      .locator('[data-slot="candidate-card"]')
      .count();
    if (candidateCount === 0) {
      await expect(
        queue.locator('[data-slot="learning-queue-empty"]'),
      ).toContainText("暂无待裁决经验");
    } else {
      const firstCard = queue.locator('[data-slot="candidate-card"]').first();
      await expect(
        firstCard.locator('[data-slot="learning-adopt"]'),
      ).toBeVisible();
      await expect(
        firstCard.locator('[data-slot="learning-discard"]'),
      ).toBeVisible();
      await expect(
        firstCard.locator('[data-slot="learning-edit"]'),
      ).toBeVisible();
    }

    // 快速记录 form retired → Copilot capture deep-link instead.
    await expect(
      main.locator('[data-slot="quick-record-actions"]'),
    ).toHaveCount(0);
    const capture = main.locator('[data-slot="experience-capture-link"]');
    await expect(capture).toBeVisible();
    const href = (await capture.getAttribute("href")) ?? "";
    expect(href).toContain("copilot=open");
    expect(href).toContain("surface=experience");
  });
});
