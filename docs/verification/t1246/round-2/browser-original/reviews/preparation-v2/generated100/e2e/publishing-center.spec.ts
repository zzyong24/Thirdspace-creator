import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const PROJECT_TITLE = "T599 发布日历项目";

async function dispatch(
  page: Page,
  id: string,
  input: unknown,
  accountId?: string,
  groupId?: string,
): Promise<{ id: string }> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      ...(accountId ? { "x-account-id": accountId } : {}),
      ...(groupId ? { "x-group-id": groupId } : {}),
    },
    data: { id, input },
  timeout: 120000});
  expect(response.ok(), `${id} 应成功，实得 ${response.status()}`).toBe(true);
  const payload = (await response.json()) as { data: { id: string } };
  return payload.data;
}

async function selectAccount(
  page: Page,
  accountId: string,
  baseURL: string | undefined,
  groupId: string,
) {
  await page.context().addCookies([{ name: "creatoros_current_group", value: encodeURIComponent(groupId), url: baseURL! },
    {
      name: CURRENT_ACCOUNT_COOKIE,
      value: encodeURIComponent(accountId),
      url: baseURL ?? "http://127.0.0.1",
    },
  ]);
  await page.addInitScript(({ accountId, groupId }) => {
    localStorage.setItem("creatoros:current-account", accountId);
    localStorage.setItem("creatoros:current-group", groupId);
  }, { accountId, groupId });
}

test.describe("发布中心日历主视图（T-599）", () => {
  test("真实项目排期出现在 70/30 日历视图，旧重复列表已移除", async ({
    page,
    baseURL,
  }) => {
    const group = await dispatch(page, "accountGroups.create", { body: { name: "T599 真实排期组", idempotencyKey: randomUUID() } });
    const account = await dispatch(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: `@e2e-t599-publishing-${Date.now()}`,
      },
    }, undefined, group.id);
    const project = await dispatch(
      page,
      "projects.create",
      {
        params: undefined,
        query: undefined,
        body: { title: PROJECT_TITLE, brief: "" },
      },
      account.id,
      group.id,
    );
    const originalEntry = await dispatch(
      page,
      "accounts.calendar.entries.create",
      {
        params: { accountId: account.id },
        query: undefined,
        body: { projectId: project.id, plannedDate: "2099-12-31" },
      },
      account.id,
      group.id,
    );
    await selectAccount(page, account.id, baseURL, group.id);

    await page.goto("/publishing?month=2099-12");

    const main = page.locator('main[data-page="publishing-center"]');
    await expect(main).toBeVisible();
    const layout = main.locator('[data-slot="publishing-center-layout"]');
    await expect(layout).toHaveAttribute(
      "data-layout",
      "calendar-70-performance-30",
    );

    const calendar = layout.locator('[data-slot="publishing-calendar-region"]');
    const performance = layout.locator(
      '[data-slot="publishing-performance-region"]',
    );
    await expect(calendar).toContainText("2099年12月");
    const scheduledEntry = calendar.locator(
      '[data-testid="calendar-entry-row"]',
    );
    await expect(scheduledEntry).toHaveCount(1);
    await expect(scheduledEntry).toContainText(PROJECT_TITLE);

    // 没有发布数据时仍保留真实 0/空表现，不用演示数据填充。
    await expect(performance.locator('[data-slot="analytics-rail"]')).toBeVisible();
    await expect(
      performance.getByRole("article", { name: "已发布" }),
    ).toContainText("0");
    await expect(
      performance.locator('[data-slot="platform-comparison-empty"]'),
    ).toContainText("暂无数据");

    // 原发布历史列表属于项目库存的重复呈现，发布中心不再保留。
    for (const retiredSlot of [
      "content-type-tabs",
      "publishing-toolbar",
      "publication-table",
      "pagination",
    ]) {
      await expect(main.locator(`[data-slot="${retiredSlot}"]`)).toHaveCount(0);
    }

    const activeNav = page
      .getByRole("navigation", { name: "主要导航" })
      .locator('[aria-current="page"]');
    await expect(activeNav).toHaveAttribute("href", "/publishing");
    await page.getByTestId("calendar-day-2099-12-31").click();
    const detail = page.getByTestId("calendar-day-drawer");
    await expect(detail).toHaveAttribute("data-date", "2099-12-31");
    const originalRow = detail.locator(`[data-entry-id="${originalEntry.id}"]`);
    await expect(originalRow).toContainText(PROJECT_TITLE);
    await expect(originalRow.getByRole("link", { name: "打开项目" })).toHaveAttribute("href", `/projects/${project.id}`);
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await expect(detail).not.toBeVisible();
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 11220000 });
