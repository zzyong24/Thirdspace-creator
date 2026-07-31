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
  });
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
    ([key, value]) => window.localStorage.setItem(key!, value!),
    [CURRENT_ACCOUNT_KEY, accountId],
  );
}

test.describe("Copilot 项目引用直读（T-642）", () => {
  test("长标题只显示一次，正文不重复，窄屏不溢出", async ({
    page,
    baseURL,
  }) => {
    const title =
      "CreatorOS 启动内测啦！做一条视频，最浪费时间的往往不是拍摄，而是在账这个作品讲的啥";
    const account = await dispatch(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: {
        platform: "douyin",
        accountHandle: `@e2e-t642-reference-${Date.now()}`,
      },
    });
    const project = await dispatch(
      page,
      "projects.create",
      {
        params: undefined,
        query: undefined,
        body: { title, brief: "" },
      },
      account.id,
    );
    await selectAccount(page, account.id, baseURL);

    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/?copilot=open");
    const input = page.getByLabel("我能帮你做什么");
    await input.fill("帮我看看 @CreatorOS");
    await page
      .locator(`[data-slot="project-mention-option"][data-project-id="${project.id}"]`)
      .click();

    const chip = page.locator(
      `[data-slot="context-chip"][data-kind="project"][data-project-id="${project.id}"]`,
    );
    await expect(chip).toBeVisible();
    await expect(chip).toContainText("项目");
    await expect(chip).toContainText(title);
    await expect(chip).toHaveAttribute("title", `项目 · ${title}`);
    await expect(input).toHaveValue("帮我看看 ");

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(chip).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
});
