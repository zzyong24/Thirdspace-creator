import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the 经验裁决台 page (T-062a).
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

test.describe("经验裁决台 page", () => {
  test("renders the adjudication workbench on the /experience route", async ({
    page,
  }) => {
    await page.goto("/experience");

    // TopHeader in global mode with the page title "经验沉淀".
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("经验沉淀");

    // Exactly one AppShell — no second Sidebar/TopHeader.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
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

    // 3 truth summary cards.
    const summary = main.locator('[data-slot="experience-summary-cards"]');
    await expect(summary).toBeVisible();
    await expect(summary.locator('[data-slot="summary-card"]')).toHaveCount(3);

    // Two-column workbench with both columns and the discarded fold
    // (layout order asserted by DOM x-position on desktop).
    const workbench = main.locator('[data-slot="experience-workbench"]');
    await expect(workbench).toBeVisible();
    const queue = workbench.locator('[data-slot="learning-queue"]');
    const library = workbench.locator('[data-slot="validated-library"]');
    await expect(queue).toBeVisible();
    await expect(library).toBeVisible();
    await expect(
      workbench.locator('[data-slot="discarded-section"]'),
    ).toBeVisible();
    const xQueue = (await queue.boundingBox())?.x ?? Number.POSITIVE_INFINITY;
    const xLibrary =
      (await library.boundingBox())?.x ?? Number.NEGATIVE_INFINITY;
    expect(xQueue < xLibrary).toBe(true);

    // Copilot capture deep-link replaces the retired 快速记录 form.
    await expect(
      main.locator('[data-slot="experience-capture-link"]'),
    ).toBeVisible();
    await expect(
      main.locator('[data-slot="quick-record-actions"]'),
    ).toHaveCount(0);
  });
});
