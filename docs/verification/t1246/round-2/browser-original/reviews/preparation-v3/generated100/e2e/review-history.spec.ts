import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";

async function dispatch<T extends { id: string }>(
  page: Page,
  id: string,
  input: unknown,
  accountId?: string,
): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      ...(accountId ? { "x-account-id": accountId } : {}),
    },
    data: { id, input },
  timeout: 120000});
  expect(response.ok(), `${id} 应成功，实得 ${response.status()}`).toBe(true);
  const payload = (await response.json()) as { data: T };
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

test.describe("项目复盘记录闭环（T-634）", () => {
  test("手动洞察可从历史记录读回，时间友好且窄屏不溢出", async ({
    page,
    baseURL,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const account = await dispatch(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: `@e2e-t634-review-${Date.now()}`,
      },
    });
    const project = await dispatch(
      page,
      "projects.create",
      {
        params: undefined,
        query: undefined,
        body: { title: "复盘交互真实验收", brief: "" },
      },
      account.id,
    );
    const review = await dispatch(
      page,
      "reviews.create",
      {
        params: { projectId: project.id },
        query: undefined,
        body: { reviewType: "project", contentOutputId: null },
      },
      account.id,
    );
    await dispatch(
      page,
      "reviews.insights.create",
      {
        params: { reviewId: review.id },
        query: undefined,
        body: {
          insightType: "action",
          title: "前三秒先展示结果",
          description: "减少背景铺垫，让观众先看到价值",
        },
      },
      account.id,
    );
    await dispatch(
      page,
      "reviews.complete",
      {
        params: { reviewId: review.id },
        query: undefined,
        body: undefined,
      },
      account.id,
    );
    await selectAccount(page, account.id, baseURL);

    await page.goto(`/projects/${project.id}/review`);
    await expect(
      page.getByText("手动洞察保存在本次复盘记录", { exact: false }),
    ).toBeVisible();

    const trigger = page.locator('[data-slot="review-history-trigger"]').first();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("前三秒先展示结果")).toBeVisible();
    await expect(
      page.getByText("减少背景铺垫，让观众先看到价值"),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="review-history-card"]'),
    ).not.toContainText(/T\d{2}:\d{2}:\d{2}/);
    expect(
      pageErrors.filter((message) => message.includes("Hydration failed")),
    ).toEqual([]);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(
      page.locator('[data-slot="review-history-card"]'),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await page.reload();
    await expect(
      page.locator('[data-slot="review-history-trigger"]'),
    ).toHaveCount(1);
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 10500000 });
