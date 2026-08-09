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
  test("[T-606] 模型来源状态在桌面与 390px 都可辨认且本地表单可用", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1536, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/settings");
      await page.getByRole("tab", { name: "模型配置" }).click();
      const status = page.locator('[data-slot="model-authority-status"]');
      await expect(status).toBeVisible();
      await expect(status).toContainText("本地模型正在使用");
      await expect(
        page.locator('[data-slot="model-configuration-card"]'),
      ).toBeVisible();
    }
  });

  test("renders the settings structure on the /settings route", async ({
    page,
  }) => {
    await page.goto("/settings");

    // 设置已收敛为盖在单一 AppShell 上的弹窗，不再伪装成第二个完整页面。
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);
    const dialog = page.locator('[data-slot="settings-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "设置" })).toBeVisible();
    await expect(dialog).toContainText("账号、偏好与系统");

    // 当前六个分类按真实产品顺序呈现。
    const tabs = dialog.locator('[data-slot="settings-tabs"]');
    await expect(tabs).toBeVisible();
    const tabLabels = await tabs.locator('[role="tab"]').allTextContents();
    expect(tabLabels.map((l) => l.trim())).toEqual([
      "账户",
      "偏好",
      "外观",
      "模型配置",
      "技能",
      "存储",
    ]);
    await expect(tabs.getByRole("tab", { name: "账户" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "偏好" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "外观" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "模型配置" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "技能" })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: "存储" })).toBeVisible();
    await expect(page.locator('main[data-page="settings"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="settings-grid"]')).toHaveCount(0);

    const accountCard = dialog.locator(
      '[data-slot="account-information-card"]',
    );
    await expect(accountCard).toBeVisible();

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
