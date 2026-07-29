import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const PROJECT_TITLE = "T599 排期闭环项目";

async function dispatch(
  page: Page,
  id: string,
  input: unknown,
  accountId?: string,
): Promise<{ id: string }> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      ...(accountId ? { "x-account-id": accountId } : {}),
    },
    data: { id, input },
  });
  expect(response.ok(), `${id} 应成功，实得 ${response.status()}`).toBe(true);
  const payload = (await response.json()) as { data: { id: string } };
  return payload.data;
}

async function selectAccount(
  page: Page,
  accountId: string,
  baseURL: string | undefined,
) {
  await page.context().addCookies([
    {
      name: CURRENT_ACCOUNT_COOKIE,
      value: encodeURIComponent(accountId),
      url: baseURL ?? "http://127.0.0.1",
    },
  ]);
  await page.addInitScript(
    ([key, id]) => window.localStorage.setItem(key!, id!),
    [CURRENT_ACCOUNT_KEY, accountId],
  );
}

test.describe("项目排期闭环（T-599）", () => {
  test("可在项目行新增、修改并取消发布排期", async ({
    page,
    baseURL,
  }) => {
    const account = await dispatch(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: `@e2e-t599-projects-${Date.now()}`,
      },
    });
    const project = await dispatch(
      page,
      "projects.create",
      {
        params: undefined,
        query: undefined,
        body: { title: PROJECT_TITLE, brief: "" },
      },
      account.id,
    );
    await selectAccount(page, account.id, baseURL);

    await page.goto("/projects");

    const main = page.locator('main[data-page="projects"]');
    await expect(main).toBeVisible();
    const row = main.locator(
      `[data-slot="project-row"][data-project-id="${project.id}"]`,
    );
    await expect(row).toContainText(PROJECT_TITLE);

    const trigger = row.locator('[data-slot="project-schedule-trigger"]');
    await expect(trigger).toHaveAttribute("data-scheduled", "false");
    await expect(trigger).toContainText("排期");

    // 新增：日期控件只能从账号时区的今天开始，保存后使用服务端回读值。
    await trigger.click();
    const dateInput = page.getByRole("textbox", { name: "计划发布日期" });
    await expect(dateInput).toHaveAttribute("min", /^\d{4}-\d{2}-\d{2}$/);
    await dateInput.fill("2099-12-31");
    await page.getByRole("button", { name: "确认排期" }).click();
    await expect(trigger).toHaveAttribute("data-scheduled", "true");
    await expect(trigger).toContainText("12月31日");

    // 改期：仍从同一个项目行入口完成。
    await trigger.click();
    await expect(dateInput).toHaveValue("2099-12-31");
    await dateInput.fill("2099-12-30");
    await page.getByRole("button", { name: "保存改期" }).click();
    await expect(trigger).toContainText("12月30日");

    // 取消：二次确认后，排期从项目、发布日历和首页提醒的共同真值中删除。
    await trigger.click();
    await page.getByRole("button", { name: "取消排期" }).click();
    const dialog = page.getByRole("dialog", { name: "取消这项排期？" });
    await expect(dialog).toContainText(PROJECT_TITLE);
    await dialog.getByRole("button", { name: "确认取消排期" }).click();
    await expect(trigger).toHaveAttribute("data-scheduled", "false");
    await expect(trigger).toContainText("排期");
  });
});
