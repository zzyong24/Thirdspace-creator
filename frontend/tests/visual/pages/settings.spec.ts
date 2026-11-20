import { expect, test } from "../../helpers/test-environment";

test("renders the settings dialog within the workbench shell", async ({ page }) => {
  await page.goto("/settings");

  const dialog = page.getByRole("dialog", { name: "设置", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

  const categories = dialog.getByRole("navigation", { name: "设置分类导航" });
  await expect(categories.getByRole("tab")).toHaveText([
    "账户", "偏好", "外观", "模型配置", "技能", "存储",
  ]);
  await expect(categories.getByRole("tab", { name: "账户" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByText("账户信息", { exact: true })).toBeVisible();
});
