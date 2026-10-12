import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Planning Workspace page
 * (Task 14).
 *
 * The page is unit-tested in
 * `src/features/planning/planning-workspace-page.test.tsx`. This spec
 * exists to capture an updated screenshot of the production route once
 * the dev server is running, so the visual regression baseline can be
 * updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- planning
 */

test.describe("Planning Workspace page", () => {
  test("renders the planning workspace structure on the /projects/:projectId/planning route", async ({
    page,
  }) => {
    await page.goto("/projects/project-ainativebrowser/planning");

    // TopHeader in project-workspace mode and the canonical project
    // identity.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "project-workspace");
    const identity = page.locator(
      '[data-slot="header-project-identity"]',
    );
    await expect(identity).toContainText("AI Native Browser 深度解析");

    // Primary action "进入下一步:脚本撰写" lives in the header.
    await expect(
      header.getByRole("button", { name: /进入下一步:脚本撰写/ }),
    ).toBeVisible();

    // The six-stage stepper in canonical order.
    const stepperItems = page.locator(
      '[data-slot="header-stage-stepper"] li',
    );
    await expect(stepperItems).toHaveCount(6);

    // Planning Tabs row with five tabs in spec order.
    const tabsSection = page.locator('[data-slot="planning-tabs"]');
    await expect(tabsSection).toBeVisible();
    const tabTriggers = tabsSection.locator(
      '[data-slot="page-tabs"] [data-tab-id]',
    );
    await expect(tabTriggers).toHaveCount(5);
    await expect(tabTriggers).toHaveText([
      "内容合同",
      "论点树",
      "证据地图",
      "受众洞察",
      "差异化亮点",
    ]);

    // Four ContractCard in the ContentContractSection.
    const contractSection = page.locator(
      '[data-slot="content-contract-section"]',
    );
    await expect(contractSection).toBeVisible();
    const contractCards = contractSection.locator(
      '[data-slot="contract-card"]',
    );
    await expect(contractCards).toHaveCount(4);
    await expect(contractCards).toHaveText([
      "受众定位",
      "价值主张",
      "核心节奏",
      "行动召唤",
    ]);

    // Core Thesis is a separate, emphasised card.
    const coreThesis = page.locator('[data-slot="core-thesis-card"]');
    await expect(coreThesis).toBeVisible();
    // Core Thesis lives OUTSIDE the ContentContractSection.
    expect(
      await contractSection
        .locator('[data-slot="core-thesis-card"]')
        .count(),
    ).toBe(0);

    // ThesisTreeSection with central root + 4 columns in spec order.
    const treeSection = page.locator('[data-slot="thesis-tree-section"]');
    await expect(treeSection).toBeVisible();
    await expect(
      treeSection.locator('[data-slot="thesis-tree-root"]'),
    ).toBeVisible();
    const columns = treeSection.locator('[data-slot="thesis-column"]');
    await expect(columns).toHaveCount(4);
    await expect(
      columns.locator('[data-slot="thesis-column-title"]'),
    ).toHaveText(["核心论点", "支持依据", "证据", "反驳"]);

    // Right rail with EvidenceMap + KeyMaterials in spec order.
    for (const slot of ["evidence-map-card", "key-materials-card"]) {
      await expect(
        page.locator(
          `[data-slot="planning-right-rail"] [data-slot="${slot}"]`,
        ),
      ).toBeVisible();
    }

    // Projects nav item remains active in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/projects");
  });
});
