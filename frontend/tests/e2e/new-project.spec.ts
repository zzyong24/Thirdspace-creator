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
    await expect(sections).toHaveCount(5);
    expect(
      await sections.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-section")),
      ),
    ).toEqual(["name", "brief", "platform", "content-type", "creation-mode"]);
  });

  test("creates and enters the new project research workspace when requested", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /新建项目/ }).click();

    const dialog = page.getByRole("dialog", { name: "新建项目" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/项目名称/).fill("AI Native Browser 深度解析");
    await dialog.getByRole("button", { name: /^创建$/ }).click();

    await page.waitForURL("**/projects/ai-native-browser/research");
    expect(new URL(page.url()).pathname).toBe(
      "/projects/ai-native-browser/research",
    );
    await expect(page.getByRole("dialog", { name: "新建项目" })).toHaveCount(0);
  });
});
