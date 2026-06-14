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
});
