import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the Assets Center page (Task 20).
 *
 *  - Direct visit to `/assets` renders the asset gallery with the
 *    canonical asset cards (image / video / audio / document).
 *  - The page-internal AssetTypeSidebar is distinct from the global
 *    Sidebar (different `data-slot`).
 *  - The TopHeader is in `global` mode with page title "素材中心"
 *    and the Sidebar marks Assets as the active nav item.
 *  - The global Sidebar uses the approved `storage` contextual-card
 *    variant (D-003).
 *  - Clicking a different card updates the fixed right-side detail
 *    panel's `data-asset-id` slot. The detail panel is NOT a dialog.
 *  - The StorageUsageCard is rendered below the gallery.
 */

test.describe("Assets Center page", () => {
  test("renders the assets gallery with toolbar, type sidebar, and detail panel", async ({
    page,
  }) => {
    await page.goto("/assets");

    // Header in global mode with the page title.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("素材中心");

    // The Assets nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/assets");

    // Global Sidebar uses the approved storage contextual-card
    // variant (D-003).
    const storageCard = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
    );
    await expect(storageCard).toBeVisible();

    // Single AppShell with one Sidebar/TopHeader.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The page-internal AssetTypeSidebar is rendered INSIDE the page
    // content region with a distinct `data-slot` so it can never be
    // confused with the global Sidebar (page-specs §12).
    const typeSidebar = page.locator(
      '[data-slot="asset-type-sidebar"]',
    );
    await expect(typeSidebar).toBeVisible();
    expect(
      await typeSidebar.evaluate((el) =>
        el.closest('[data-slot="app-sidebar"]') !== null,
      ),
    ).toBe(false);
    // And it carries its own type rows.
    const typeRows = typeSidebar.locator(
      '[data-asset-type]',
    );
    expect(await typeRows.count()).toBeGreaterThanOrEqual(2);

    // Asset toolbar with search, filter and upload affordances.
    await expect(page.locator('[data-slot="asset-toolbar"]')).toBeVisible();
    await expect(
      page.locator('input[type="search"]').first(),
    ).toBeVisible();

    // Asset gallery: three-column grid.
    const grid = page.locator('[data-slot="asset-card-grid"]');
    await expect(grid).toBeVisible();
    const cards = grid.locator('[data-slot="asset-card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(4);

    // Detail panel is fixed right-rail (NOT a dialog).
    const panel = page.locator('[data-slot="asset-detail-panel"]:visible');
    await expect(panel).toBeVisible();
    expect(
      await panel.evaluate((el) => el.closest('[role="dialog"]') !== null),
    ).toBe(false);

    // Storage usage card is below the gallery.
    const storageUsage = page.locator('[data-slot="storage-usage-card"]');
    await expect(storageUsage).toBeVisible();
  });

  test("clicking a different card updates the AssetDetailPanel", async ({
    page,
  }) => {
    await page.goto("/assets");
    const panel = page.locator('[data-slot="asset-detail-panel"]:visible');
    await expect(panel).toBeVisible();
    const initialAssetId = await panel.getAttribute("data-asset-id");
    expect(initialAssetId).not.toBeNull();

    // Click the first card whose asset-id differs from the initial one.
    const cards = page.locator('[data-slot="asset-card"]');
    const count = await cards.count();
    let clicked = false;
    for (let i = 0; i < count; i += 1) {
      const id = await cards.nth(i).getAttribute("data-asset-id");
      if (id !== null && id !== initialAssetId) {
        await cards.nth(i).locator("button").first().click();
        clicked = true;
        break;
      }
    }
    expect(clicked).toBe(true);

    await expect(panel).not.toHaveAttribute("data-asset-id", initialAssetId!);
  });
});
