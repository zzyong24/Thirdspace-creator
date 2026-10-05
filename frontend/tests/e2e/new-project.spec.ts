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

  test("creates and enters the new project research workspace when requested", async ({
    page,
    baseURL,
  }) => {
    const response = await page.request.post("/api/v1/dispatch", {
      headers: { "content-type": "application/json" },
      data: { id: "accounts.create", input: { params: undefined, query: undefined,
        body: { platform: "douyin", accountHandle: `new-project-${Date.now()}` } } },
    });
    expect(response.ok()).toBe(true);
    const { data: account } = await response.json() as { data: { id: string } };
    await page.context().addCookies([{ name: "creatoros_current_account", value: encodeURIComponent(account.id),
      url: baseURL ?? "http://127.0.0.1" }]);
    await page.addInitScript((accountId) => window.localStorage.setItem("creatoros:current-account", accountId), account.id);
    await page.goto("/");
    await page.getByRole("link", { name: /新建项目/ }).click();

    const dialog = page.getByRole("dialog", { name: "新建项目" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/项目名称/).fill("AI Native Browser 深度解析");
    await dialog.getByText("竖屏 9:16", { exact: true }).click();
    await dialog.getByRole("button", { name: /^创建$/ }).click();

    await page.waitForURL(/\/projects\/[^/]+$/);
    expect(new URL(page.url()).pathname).toMatch(/^\/projects\/[^/]+$/);
    await expect(page.getByText("AI Native Browser 深度解析", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("dialog", { name: "新建项目" })).toHaveCount(0);
  });
});
