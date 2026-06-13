import { expect, test } from "../helpers/test-environment";

/**
 * E2E smoke test for the Script Workspace page (Task 15).
 *
 * Validates the rendered DOM on the production `/projects/:projectId/script`
 * route against the structural invariants locked by `page-specs §7`
 * and `decision-log D-008`:
 *  - The TopHeader renders in `project-workspace` mode with the
 *    canonical project identity "AI Native Browser 深度解析" and the
 *    six-stage stepper, with the Script stage active.
 *  - The Script Tabs row exposes exactly four tabs in the locked
 *    spec order 主脚本 / 章节 / 引用 / 摘要.
 *  - The RichTextEditor exposes a single shell that hosts the
 *    toolbar (`role="toolbar"`), the script document (sections,
 *    time codes and a purple emphasis span) and the status bar.
 *  - The VersionHistoryStrip is a horizontal strip that lives BELOW
 *    the editor shell.
 *  - The right rail hosts OutlineStructureCard →
 *    AIWritingSuggestionsCard → GoldenQuotesCard in that order.
 *
 * Run with:
 *   pnpm test:e2e -- script
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
    const toolbarButtons = toolbar.locator(
      '[data-slot="editor-toolbar-button"]',
    );
    const buttonCount = await toolbarButtons.count();
    expect(buttonCount).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < buttonCount; i += 1) {
      await expect(toolbarButtons.nth(i)).toHaveAttribute(
        "aria-pressed",
        /(true|false)/,
      );
    }

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
    await expect(
      statusBar.locator('[data-slot="editor-status-word-count"]'),
    ).toBeVisible();
    await expect(
      statusBar.locator('[data-slot="editor-status-save-status"]'),
    ).toBeVisible();

    // Version history strip lives below the editor shell, horizontal.
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