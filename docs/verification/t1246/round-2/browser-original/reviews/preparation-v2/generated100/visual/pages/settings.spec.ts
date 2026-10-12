import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the Settings page (Task 25).
 *
 * The page is unit-tested in
 * `src/features/settings/settings-page.test.tsx`. This spec exists
 * to capture an updated screenshot of the settings route once the
 * dev server is running, so the visual regression baseline can be
 * updated via `pnpm playwright test --update-snapshots`.
 *
 * Run with:
 *   pnpm test:visual -- settings
 */

test.describe("Settings page", () => {
  test("renders the settings structure on the /settings route", async ({
    page,
  }) => {
    await page.goto("/settings");

    // TopHeader in global mode with the page title "设置".
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("设置");
    await expect(heading).toContainText("账号、偏好与系统");

    // The page must live inside exactly one AppShell — no second
    // Sidebar/TopHeader is created.
    const shells = page.locator('[data-slot="app-shell"]');
    await expect(shells).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // The Settings nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/settings");

    // The contextual card variant is `assistant` (NOT `storage`).
    const assistant = page.locator(
      '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
    );
    await expect(assistant).toBeVisible();

    // The main <main data-page="settings"> region exists exactly once.
    const main = page.locator('main[data-page="settings"]');
    await expect(main).toHaveCount(1);

    // SettingsTabs visible with 8 tabs in spec order.
    const tabs = main.locator('[data-slot="settings-tabs"]');
    await expect(tabs).toBeVisible();
    const tabLabels = await tabs.locator('[role="tab"]').allTextContents();
    expect(tabLabels.map((l) => l.trim())).toEqual([
      "账户",
      "偏好",
      "通知",
      "外观",
      "集成",
      "存储",
      "数据",
      "关于",
    ]);

    // MainSettings region visible.
    await expect(main.locator('[data-slot="main-settings"]')).toBeVisible();

    // SettingsRail region visible.
    await expect(main.locator('[data-slot="settings-rail"]')).toBeVisible();

    // No team / permission / subscription detail regions.
    await expect(
      page.locator('[data-slot="team-settings-card"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-slot="permission-settings-card"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-slot="subscription-settings-card"]'),
    ).toHaveCount(0);
  });
});
