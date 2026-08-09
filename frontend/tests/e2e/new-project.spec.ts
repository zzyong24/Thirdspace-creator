import { expect, test } from "../helpers/test-environment";

test.describe("New Project dialog", () => {
  test("opens from the dashboard and preserves the approved form order", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /新建项目/ }).click();

    await expect(page).toHaveURL(/\/projects\/new$/);
    const dialog = page.getByRole("dialog", { name: "新建项目" });
    await expect(dialog).toBeVisible();
    const sections = dialog.locator("[data-form-section]");
    await expect(sections).toHaveCount(4);
    expect(
      await sections.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-section")),
      ),
    ).toEqual(["name", "brief", "orientation", "creation-mode"]);
  });

  test("creates and enters the unified project workbench when requested", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /新建项目/ }).click();

    const dialog = page.getByRole("dialog", { name: "新建项目" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/项目名称/).fill(`E2E 新项目 ${Date.now()}`);
    await dialog.getByText("竖屏 9:16", { exact: true }).click();
    await dialog.getByRole("button", { name: /^创建$/ }).click();

    await page.waitForURL(/\/projects\/[^/]+$/);
    await expect(page).not.toHaveURL(/\/research$/);
    await expect(page.getByRole("dialog", { name: "新建项目" })).toHaveCount(0);
  });
});
