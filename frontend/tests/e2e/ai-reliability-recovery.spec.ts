import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const SCRIPT = "AI 产出不对时，先检查输入、处理和输出，再判断是不是工具的问题。";
const SRT = `1
00:00:00,000 --> 00:00:04,000
AI 产出不对时先检查输入

2
00:00:04,000 --> 00:00:08,000
再检查处理和输出

3
00:00:08,000 --> 00:00:12,000
最后判断是不是工具的问题
`;

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
  });
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

test("视频决策失败可见、终态停轮询，重新运行显式携带来源任务", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const account = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined,
    query: undefined,
    body: {
      platform: "douyin",
      accountHandle: `@e2e-t804-${Date.now()}`,
    },
  });
  const project = await dispatch<{ id: string }>(
    page,
    "projects.create",
    {
      params: undefined,
      query: undefined,
      body: { title: "AI 可靠性恢复真实验收", brief: "" },
    },
    account.id,
  );
  const artifact = await dispatch<{ id: string }>(
    page,
    "artifacts.create",
    {
      params: { projectId: project.id },
      query: undefined,
      body: { title: "口播稿", artifactType: "output_script", stage: "script" },
    },
    account.id,
  );
  await dispatch(
    page,
    "artifacts.versions.create",
    {
      params: { artifactId: artifact.id },
      query: undefined,
      body: { contentText: SCRIPT, changeSummary: "T-804 浏览器验收稿" },
    },
    account.id,
  );

  // 先生成一条真实 terminal video.decisions 任务。无效 SRT 会在备料阶段立即取消，
  // 不调用任何外部模型；浏览器随后只复用这条真实任务来验证 UI 的终态与重试协议。
  const terminalTask = await dispatch<{ id: string; status: string }>(
    page,
    "ai.tasks.create",
    {
      params: undefined,
      query: undefined,
      body: {
        taskType: "video.decisions",
        attemptId: randomUUID(),
        inputData: { projectId: project.id, srtText: "无效 SRT", script: SCRIPT },
      },
    },
    account.id,
  );
  await expect
    .poll(
      async () =>
        (
          await dispatch<{ status: string }>(
            page,
            "ai.tasks.get",
            {
              params: { taskId: terminalTask.id },
              query: undefined,
              body: undefined,
            },
            account.id,
          )
        ).status,
    )
    .toBe("cancelled");

  await selectAccount(page, account.id, baseURL);
  const createBodies: Array<Record<string, unknown>> = [];
  let taskGetCount = 0;
  await page.route("**/api/v1/dispatch", async (route) => {
    const body = route.request().postDataJSON() as {
      id?: string;
      input?: { body?: Record<string, unknown> };
    };
    if (body.id === "ai.tasks.create" && body.input?.body?.taskType === "video.decisions") {
      createBodies.push(body.input.body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: terminalTask,
          meta: { requestId: "e2e-t804" },
        }),
      });
      return;
    }
    if (body.id === "ai.tasks.get") taskGetCount += 1;
    await route.continue();
  });

  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(`/projects/${project.id}/production`);
  await page
    .locator('input[aria-label="上传粗剪人物视频"]')
    .setInputFiles(
      resolve(
        process.cwd(),
        "../output/content-samples/composable-scene-graph-loop/archive-understanding.landscape.mp4",
      ),
    );
  await page
    .locator('input[aria-label="上传 SRT 字幕"]')
    .setInputFiles({ name: "t804.srt", mimeType: "text/plain", buffer: Buffer.from(SRT) });
  await expect(page.getByText("已上传:t804.srt")).toBeVisible();

  const button = page.locator('[data-slot="dispatch-decisions"]');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('[data-slot="production-decisions"]')).toContainText(
    "失败",
    { timeout: 15_000 },
  );
  expect(createBodies[0]?.retryOfTaskId).toBeUndefined();

  const terminalGetCount = taskGetCount;
  await page.waitForTimeout(4_500);
  expect(taskGetCount).toBe(terminalGetCount);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => createBodies.length).toBe(2);
  expect(createBodies[1]?.retryOfTaskId).toBe(terminalTask.id);
});
