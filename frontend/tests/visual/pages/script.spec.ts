import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Script Workspace page
 * (Task 15).
 *
 * The page is unit-tested in
 * `src/features/script/script-workspace-page.test.tsx`. This spec
 * exists to capture an updated screenshot of the production route once
 * the dev server is running, so the visual regression baseline can be
 * updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- script
 */

test.describe("Script Workspace page", () => {
  test("renders the script workspace structure on the /projects/:projectId/script route", async ({
    page,
  }) => {
    await page.goto("/projects/project-ainativebrowser/script");

    // TopHeader in project-workspace mode and the canonical project
    // identity.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "project-workspace");
    const identity = page.locator(
      '[data-slot="header-project-identity"]',
    );
    await expect(identity).toContainText("AI Native Browser 深度解析");

    // Primary action "进入下一步:拍摄制作" lives in the header.
    await expect(
      header.getByRole("button", { name: /进入下一步:拍摄制作/ }),
    ).toBeVisible();

    // The six-stage stepper in canonical order with Script active.
    const stepperItems = page.locator(
      '[data-slot="header-stage-stepper"] li',
    );
    await expect(stepperItems).toHaveCount(6);
    const activeStage = page.locator(
      '[data-slot="header-stage-stepper"] [data-status="in_progress"]',
    );
    await expect(activeStage).toHaveCount(1);
    await expect(activeStage).toContainText("脚本");

    // Script Tabs row with four tabs in spec order.
    const tabsSection = page.locator('[data-slot="script-tabs"]');
    await expect(tabsSection).toBeVisible();
    const tabTriggers = tabsSection.locator(
      '[data-slot="page-tabs"] [data-tab-id]',
    );
    await expect(tabTriggers).toHaveCount(4);
    await expect(tabTriggers).toHaveText([
      "主脚本",
      "章节",
      "引用",
      "摘要",
    ]);

    // RichTextEditor shell with toolbar, document, and status bar.
    const editorShell = page.locator('[data-slot="rich-text-editor"]');
    await expect(editorShell).toBeVisible();

    // Toolbar exposes role="toolbar" with aria-pressed buttons.
    const toolbar = editorShell.locator('[data-slot="editor-toolbar"]');
    await expect(toolbar).toHaveAttribute("role", "toolbar");

    // Script document has section headings, time codes and emphasis.
    const document = editorShell.locator('[data-slot="script-document"]');
    await expect(document).toBeVisible();
    const headings = document.locator(
      '[data-slot="script-section-heading"]',
    );
    expect(await headings.count()).toBeGreaterThanOrEqual(3);
    const timecodes = document.locator(
      '[data-slot="script-section-timecode"]',
    );
    expect(await timecodes.count()).toBeGreaterThanOrEqual(3);
    await expect(document.locator('[data-slot="script-emphasis"]')).toHaveCount(
      1,
    );

    // Status bar with word count and save status.
    const statusBar = editorShell.locator(
      '[data-slot="editor-status-bar"]',
    );
    await expect(statusBar).toBeVisible();

    // Version history strip lives below the editor shell.
    const versionStrip = page.locator(
      '[data-slot="version-history-strip"]',
    );
    await expect(versionStrip).toBeVisible();
    const versionCards = versionStrip.locator(
      '[data-slot="version-history-card"]',
    );
    expect(await versionCards.count()).toBeGreaterThanOrEqual(2);

    // Right rail order: OutlineStructure → AI Suggestions → Golden Quotes.
    for (const slot of [
      "outline-structure-card",
      "ai-writing-suggestions-card",
      "golden-quotes-card",
    ]) {
      await expect(
        page.locator(
          `[data-slot="script-right-rail"] [data-slot="${slot}"]`,
        ),
      ).toBeVisible();
    }

    // Projects nav item remains active in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});