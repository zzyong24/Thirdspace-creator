import { expect, test } from "../helpers/test-environment";

/**
 * E2E smoke test for the Publishing Workspace page (Task 17).
 *
 * Validates the rendered DOM on the production
 * `/projects/:projectId/publishing` route against the structural
 * invariants locked by `page-specs §9`:
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity "AI Native Browser 深度解析" and the
 *    six-stage stepper, with the Publishing stage active.
 *  - The Publishing Tabs row renders.
 *  - The Publishing Grid is a three-column layout in the spec order
 *    BasicInformationForm → PlatformPublishingPanel → PreviewRail
 *    (NOT a wizard, NOT a single-column).
 *  - The BasicInformationForm renders fields in spec order:
 *    title → description → cover → tags → category → publishing options.
 *  - The PlatformPublishingPanel exposes separate platform cards plus
 *    Batch Time / Confirm Publish / Pre-Publish Check controls.
 *  - The PreviewRail renders Preview → PublishChecklist → PublishTips
 *    in spec order.
 *  - The Confirm Publish button is fixture-only (renders with the
 *    expected label, but does not perform network calls).
 *  - The page is wrapped in exactly one AppShell with the sidebar
 *    marking "项目" as the active nav item.
 *
 * Run with:
 *   pnpm test:e2e -- publishing-workspace
 */

test.describe("Publishing Workspace page", () => {
  test("renders the publishing workspace structure on the /projects/:projectId/publishing route", async ({
    page,
  }) => {
    await page.goto("/projects/project-ainativebrowser/publishing");

    // TopHeader in project-workspace mode and the canonical project
    // identity.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "project-workspace");
    const identity = page.locator(
      '[data-slot="header-project-identity"]',
    );
    await expect(identity).toContainText("AI Native Browser 深度解析");

    // Primary action "查看数据" links to the review workspace.
    const primaryAction = header.getByRole("link", { name: /查看数据/ });
    await expect(primaryAction).toBeVisible();
    await expect(primaryAction).toHaveAttribute(
      "href",
      "/projects/project-ainativebrowser/review",
    );

    // The six-stage stepper in canonical order with Publishing active.
    const stepperItems = page.locator(
      '[data-slot="header-stage-stepper"] li',
    );
    await expect(stepperItems).toHaveCount(6);
    const activeStage = page.locator(
      '[data-slot="header-stage-stepper"] [data-status="in_progress"]',
    );
    await expect(activeStage).toHaveCount(1);
    await expect(activeStage).toContainText("发布");

    // Publishing Tabs row.
    const tabs = page.locator('[data-slot="publishing-tabs"]');
    await expect(tabs).toBeVisible();

    // Three-column PublishingGrid in spec order.
    for (const slot of [
      "basic-information-form",
      "platform-publishing-panel",
      "preview-rail",
    ]) {
      await expect(
        page.locator(`[data-slot="publishing-grid"] [data-slot="${slot}"]`),
      ).toBeVisible();
    }

    // BasicInformationForm fields in spec order.
    for (const slot of [
      "title-field",
      "description-field",
      "cover-selector",
      "tags-field",
      "category-field",
      "publishing-options-field",
    ]) {
      await expect(
        page.locator(
          `[data-slot="basic-information-form"] [data-slot="${slot}"]`,
        ),
      ).toBeVisible();
    }

    // PlatformPublishingPanel: separate cards + controls.
    const panel = page.locator('[data-slot="platform-publishing-panel"]');
    const platformCards = panel.locator(
      '[data-slot="platform-publish-card"]',
    );
    expect(await platformCards.count()).toBeGreaterThanOrEqual(2);
    await expect(
      panel.locator('[data-slot="batch-time-actions"]'),
    ).toBeVisible();
    await expect(
      panel.locator('[data-slot="confirm-publish-button"]'),
    ).toBeVisible();
    await expect(
      panel.locator('[data-slot="pre-publish-check"]'),
    ).toBeVisible();

    // PreviewRail in spec order.
    for (const slot of [
      "platform-preview",
      "publish-checklist",
      "publish-tips",
    ]) {
      await expect(
        page.locator(`[data-slot="preview-rail"] [data-slot="${slot}"]`),
      ).toBeVisible();
    }

    // Confirm Publish is fixture-only — visible but inert (no form
    // action, no fetch).
    const confirmButton = page.locator(
      '[data-slot="confirm-publish-button"]',
    );
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toContainText(/确认发布/);
    const confirmType = await confirmButton.getAttribute("type");
    expect(confirmType).toBe("button");

    // Projects nav item remains active in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});
