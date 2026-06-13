import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the Settings page (Task 25).
 *
 *  - Direct visit to `/settings` renders the global resource-center
 *    landing page (page-specs §17).
 *  - The TopHeader is in `global` mode with page title "设置" and
 *    description "账号、偏好与系统". The Sidebar marks "设置" as
 *    the active nav item.
 *  - The contextual card variant is `assistant` (D-003, NOT `storage`).
 *  - SettingsTabs render 8 tabs in the approved order from the
 *    reference image.
 *  - SettingsGrid renders MainSettings (AccountInformationCard →
 *    PreferenceSettingsCard → SystemSettingsCard) and SettingsRail
 *    (StorageUsageCard → ModelConfigurationCard → OtherSettingsCard)
 *    in the locked spec order (page-specs §17 "组件树").
 *  - The page is wrapped in exactly one AppShell — no second
 *    Sidebar/TopHeader.
 *  - No team / subscription / model-detail / server persistence
 *    affordances are added (D-001 + page-specs §17 "禁止改变").
 */

test.describe("Settings page", () => {
  test("renders the settings structure on the /settings route", async ({
    page,
  }) => {
    await page.goto("/settings");

    // Header in global mode with the page title.
    const header = page.locator('[data-slot="app-top-header"]');
    await expect(header).toHaveAttribute("data-mode", "global");
    const heading = page.locator('[data-slot="header-page-heading"]');
    await expect(heading).toContainText("设置");
    await expect(heading).toContainText("账号、偏好与系统");

    // The Settings nav item is the active page in the sidebar.
    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/settings");

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
    const main = page.locator('main[data-page="settings"]');
    await expect(main).toHaveCount(1);

    // SettingsTabs in spec order (8 tabs).
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

    // MainSettings: Account → Preference → System.
    const accountCard = main.locator(
      '[data-slot="account-information-card"]',
    );
    const preferenceCard = main.locator(
      '[data-slot="preference-settings-card"]',
    );
    const systemCard = main.locator(
      '[data-slot="system-settings-card"]',
    );
    await expect(accountCard).toBeVisible();
    await expect(preferenceCard).toBeVisible();
    await expect(systemCard).toBeVisible();

    // SettingsRail: Storage → Model → Other.
    const storageCard = main.locator('[data-slot="storage-usage-card"]');
    const modelCard = main.locator(
      '[data-slot="model-configuration-card"]',
    );
    const otherCard = main.locator('[data-slot="other-settings-card"]');
    await expect(storageCard).toBeVisible();
    await expect(modelCard).toBeVisible();
    await expect(otherCard).toBeVisible();

    // No team / permission / subscription detail routes.
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
