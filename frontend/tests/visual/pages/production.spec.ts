import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Production Workspace page
 * (Task 16).
 *
 * The page is unit-tested in
 * `src/features/production/production-workspace-page.test.tsx`. This
 * spec exists to capture an updated screenshot of the production route
 * once the dev server is running, so the visual regression baseline
 * can be updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- production
 */

test.describe("Production Workspace page", () => {
  test("renders the production workspace structure on the /projects/:projectId/production route", async ({
    page,
  }) => {
    await page.goto("/projects/project-ainativebrowser/production");

    // TopHeader in project-workspace mode and the canonical project
    // identity.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "project-workspace");
    const identity = page.locator(
      '[data-slot="header-project-identity"]',
    );
    await expect(identity).toContainText("AI Native Browser 深度解析");

    // Primary action "进入下一步:内容发布" lives in the header.
    await expect(
      header.getByRole("button", { name: /进入下一步:内容发布/ }),
    ).toBeVisible();

    // The six-stage stepper in canonical order with Production active.
    const stepperItems = page.locator(
      '[data-slot="header-stage-stepper"] li',
    );
    await expect(stepperItems).toHaveCount(6);
    const activeStage = page.locator(
      '[data-slot="header-stage-stepper"] [data-status="in_progress"]',
    );
    await expect(activeStage).toHaveCount(1);
    await expect(activeStage).toContainText("拍摄");

    // Production Mode Selector with three cards in spec order.
    const modeSelector = page.locator(
      '[data-slot="production-mode-selector"]',
    );
    await expect(modeSelector).toBeVisible();
    const modeCards = modeSelector.locator(
      '[data-slot="production-mode-card"]',
    );
    await expect(modeCards).toHaveCount(3);
    await expect(modeCards).toHaveText([
      /录制模式/,
      /剪辑模式/,
      /后期模式/,
    ]);

    // Four main regions in the spec order:
    // script → assets → preview → settings.
    for (const slot of [
      "recording-script-panel",
      "asset-library-panel",
      "preview-panel",
      "settings-rail",
    ]) {
      await expect(
        page.locator(`[data-slot="production-grid"] [data-slot="${slot}"]`),
      ).toBeVisible();
    }

    // Asset library: category tabs + 3-column thumbnail grid.
    const assetPanel = page.locator('[data-slot="asset-library-panel"]');
    const categoryTabs = assetPanel.locator(
      '[data-slot="asset-category-tab"]',
    );
    expect(await categoryTabs.count()).toBeGreaterThanOrEqual(2);
    const assetGrid = assetPanel.locator(
      '[data-slot="asset-thumbnail-grid"]',
    );
    await expect(assetGrid).toBeVisible();
    const thumbnails = assetGrid.locator(
      '[data-slot="asset-thumbnail"]',
    );
    expect(await thumbnails.count()).toBeGreaterThanOrEqual(3);

    // Settings rail: three groups in spec order.
    for (const slot of [
      "recording-settings",
      "subtitle-settings",
      "export-settings",
    ]) {
      await expect(
        page.locator(`[data-slot="settings-rail"] [data-slot="${slot}"]`),
      ).toBeVisible();
    }
    // Export button lives inside the export settings card (D-016).
    const exportButton = page.locator('[data-slot="export-button"]');
    await expect(exportButton).toBeVisible();

    // Single horizontal timeline (not a multi-track layout).
    const timelines = page.locator('[data-slot="timeline-panel"]');
    await expect(timelines).toHaveCount(1);
    const track = page.locator('[data-slot="timeline-track"]');
    await expect(track).toBeVisible();
    const segmentCards = track.locator(
      '[data-slot="timeline-segment-card"]',
    );
    expect(await segmentCards.count()).toBeGreaterThanOrEqual(2);

    // Projects nav item remains active in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});
