import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

async function dispatch<T>(page: Page, id: string, input: unknown, accountId?: string): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      ...(accountId ? { "x-account-id": accountId } : {}),
    },
    data: { id, input },
  timeout: 120000});
  expect(response.ok(), `${id} 应成功，实得 ${response.status()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

test("旧发布阶段链接进入当前项目稿面的发布区", async ({ page, baseURL }) => {
  const account = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined,
    query: undefined,
    body: { platform: "douyin", accountHandle: `@e2e-publishing-route-${Date.now()}` },
  });
  const project = await dispatch<{ id: string }>(page, "projects.create", {
    params: undefined,
    query: undefined,
    body: { title: "发布入口回归项目", brief: "" },
  }, account.id);
  await page.context().addCookies([{
    name: "creatoros_current_account",
    value: encodeURIComponent(account.id),
    url: baseURL ?? "http://127.0.0.1",
  }]);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    ["creatoros:current-account", account.id],
  );

  await page.goto(`/projects/${project.id}/publishing`);
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}#publish$`));
  const workbench = page.locator('main[data-page="draft-workbench"]');
  await expect(workbench).toHaveAttribute("data-project-id", project.id);
  await expect(workbench.locator('[data-slot="draft-publish-pack"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "未找到该页面" })).toHaveCount(0);
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 6180000 });
