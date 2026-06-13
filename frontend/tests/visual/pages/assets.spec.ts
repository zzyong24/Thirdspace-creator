import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Assets Center page
 * (Task 20).
 *
 * The page is unit-tested in
 * `src/features/assets/assets-page.test.tsx`. This spec
 * exists to capture an updated screenshot of the assets route
 * once the dev server is running, so the visual regression
 * baseline can be updated via
 * `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- assets
 */

test.describe("Assets Center page", () => {
  test("renders the assets structure on the /assets route", async ({
    page,
  }) => {
    await page.goto("/assets");

    // TopHeader in global mode with the page title "素材中心".
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("素材中心");

    // The page must live inside exactly one AppShell — no second
    // Sidebar/TopHeader is created.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The Assets nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/assets");

    // The main <main data-page="assets"> region exists exactly once.
    const main = page.locator('main[data-page="assets"]');
    await expect(main).toHaveCount(1);

    // AssetToolbar (search input present).
    const toolbar = main.locator('[data-slot="asset-toolbar"]');
    await expect(toolbar).toBeVisible();
    await expect(
      toolbar.locator('input[type="search"]'),
    ).toBeVisible();

    // Page-internal AssetTypeSidebar is distinct from global Sidebar.
    const typeSidebar = main.locator(
      '[data-slot="asset-type-sidebar"]',
    );
    await expect(typeSidebar).toBeVisible();
    expect(
      await typeSidebar.evaluate(
        (el) => el.closest('[data-slot="app-sidebar"]') !== null,
      ),
    ).toBe(false);
    // And it carries its own type rows.
    const typeRows = typeSidebar.locator(
      '[data-asset-type]',
    );
    expect(await typeRows.count()).toBeGreaterThanOrEqual(2);

    // AssetGallery: three-column grid in the spec order
    // GalleryControls → AssetCardGrid → Pagination.
    const gallery = main.locator('[data-slot="asset-gallery"]');
    await expect(gallery).toBeVisible();
    await expect(
      gallery.locator('[data-slot="gallery-controls"]'),
    ).toBeVisible();
    const grid = gallery.locator('[data-slot="asset-card-grid"]');
    await expect(grid).toBeVisible();
    // At least 4 cards so the three-column layout actually shows.
    const cards = grid.locator('[data-slot="asset-card"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(4);

    // AssetDetailPanel: fixed right-rail, NOT a dialog.
    const panel = main.locator('[data-slot="asset-detail-panel"]');
    await expect(panel).toBeVisible();
    expect(
      await panel.evaluate(
        (el) => el.closest('[role="dialog"]') !== null,
      ),
    ).toBe(false);

    // Detail panel order inside the workspace:
    //   AssetTypeSidebar < AssetGallery < AssetDetailPanel.
    const workspace = main.locator('[data-slot="asset-workspace"]');
    const workspaceBox = await workspace.boundingBox();
    const sidebarBox = await typeSidebar.boundingBox();
    const galleryBox = await gallery.boundingBox();
    const panelBox = await panel.boundingBox();
    expect(
      sidebarBox && galleryBox && panelBox && workspaceBox &&
        sidebarBox.x <= galleryBox.x && galleryBox.x <= panelBox.x,
    ).toBe(true);

    // MediaPreview: distinct deterministic thumbnails per type.
    const previews = main.locator('[data-slot="media-preview"]');
    const tokensByType = new Map<string, string>();
    const previewCount = await previews.count();
    for (let i = 0; i < previewCount; i += 1) {
      const node = previews.nth(i);
      const type = await node.getAttribute("data-asset-type");
      const token = await node.getAttribute("data-asset-thumbnail-token");
      if (type && token) tokensByType.set(type, token);
    }
    for (const type of ["video", "image", "audio", "document"]) {
      expect(tokensByType.has(type)).toBe(true);
    }
    const tokens = Array.from(tokensByType.values());
    expect(new Set(tokens).size).toBe(tokens.length);

    // StorageUsageCard at the bottom of the page.
    const storageCard = main.locator(
      '[data-slot="storage-usage-card"]',
    );
    await expect(storageCard).toBeVisible();
    await expect(
      storageCard.locator('[role="progressbar"]'),
    ).toBeVisible();

    // Global Sidebar uses the approved storage variant (D-003).
    const sidebarCard = page.locator(
      '[data-slot="sidebar-contextual-card"]',
    );
    await expect(sidebarCard).toHaveAttribute("data-variant", "storage");
  });
});