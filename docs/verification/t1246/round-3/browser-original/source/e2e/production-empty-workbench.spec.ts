import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";

async function dispatch<T>(
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
  return ((await response.json()) as { data: T }).data;
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

test("新项目无视频作品时可进入剪辑备料并导入人物视频", async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(Math.max((120_000), 18060000));
  page.setDefaultTimeout(120_000);

  const account = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined,
    query: undefined,
    body: {
      platform: "douyin",
      accountHandle: `@e2e-empty-video-${Date.now()}`,
    },
  });
  const project = await dispatch<{ id: string }>(
    page,
    "projects.create",
    {
      params: undefined,
      query: undefined,
      body: { title: "空作品剪辑验收", brief: "", contentType: "video" },
    },
    account.id,
  );

  await selectAccount(page, account.id, baseURL);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(`/projects/${project.id}/production`);

  const workbench = page.locator('[data-slot="production-uploads"]');
  await expect(workbench).toBeVisible();
  await expect(
    workbench.getByRole("heading", { name: "② 上传粗剪人物视频 + SRT 字幕" }),
  ).toBeVisible();
  await expect(workbench.getByText("正在恢复当前剪辑工作台…")).toHaveCount(0);
  const videoInput = page.locator('input[aria-label="上传粗剪人物视频"]');
  await expect(videoInput).toBeAttached();

  await page.screenshot({
    path: info.outputPath("no-video-output-workbench.png"),
    fullPage: true,
  timeout: 120000});
  await videoInput.setInputFiles(
    resolve(
      process.cwd(),
      "../output/content-samples/composable-scene-graph-loop/archive-understanding.landscape.mp4",
    ),
  );
  await expect(
    workbench.getByText("✓ 已上传:archive-understanding.landscape.mp4", {
      exact: true,
    }),
  ).toBeVisible();
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 18060000 });
