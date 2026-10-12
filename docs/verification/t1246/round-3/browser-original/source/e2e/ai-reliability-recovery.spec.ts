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

test("视频决策失败可见、终态停轮询，重新运行显式携带来源任务", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(Math.max((90_000), 36060000));
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

  await selectAccount(page, account.id, baseURL);
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

  // 页面初始状态确认无历史失败后，再生成一条真实 terminal 任务。无效 SRT 在备料阶段
  // 以原 VIDEO_DECISIONS_FAILED 失败且不调用外部模型；首次按钮点击仍代表本轮新发起。
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
    .toBe("failed");

  const failedTask = await dispatch<{ id: string; status: string; errorCode: string; executionTaskId: string }>(
    page, "ai.tasks.get", { params: { taskId: terminalTask.id }, query: undefined, body: undefined }, account.id,
  );
  expect(failedTask).toMatchObject({ id: terminalTask.id, status: "failed", errorCode: "VIDEO_DECISIONS_FAILED" });
  expect(failedTask.executionTaskId).toBeTruthy();
  const originalExecution = await dispatch<{ task: { id: string; ownerId: string; attempt: number; status: string; errorCode: string }; calls: Array<{ kind: string }>; hasMore: boolean }>(
    page, "workbench.tasks.inspect", { params: { taskId: failedTask.executionTaskId }, query: { afterSequence: 0, limit: 100 }, body: undefined }, account.id,
  );
  expect(originalExecution.task).toMatchObject({ id: failedTask.executionTaskId, ownerId: terminalTask.id, attempt: 1, status: "failed", errorCode: "VIDEO_DECISIONS_FAILED" });
  expect(originalExecution.hasMore).toBe(false);
  expect(originalExecution.calls.filter((call) => call.kind === "model" || call.kind === "external_agent")).toHaveLength(0);

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
          meta: { requestId: "e2e-t805" },
        }),
      });
      return;
    }
    if (body.id === "ai.tasks.get") taskGetCount += 1;
    await route.continue();
  });

  const button = page.locator('[data-slot="dispatch-decisions"]');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('[data-slot="production-decisions"]')).toContainText(
    "如已有完成步骤，系统会保留",
    { timeout: 120000 },
  );
  await expect(page.locator('[data-slot="decisions-error"]')).not.toContainText(
    /sk-[A-Za-z0-9_-]{6,}|Bearer\s+\S+/i,
  );
  await expect(page.locator('[data-slot="decision-error-detail"]')).toContainText(
    "SRT 解析不出任何字幕行",
  );
  await expect(page.locator('[data-slot="copy-decision-error"]')).toBeVisible();
  await expect(button).toHaveText("继续上次分场");
  await page.locator('[data-slot="production-decisions"]').screenshot({
    path: resolve(process.cwd(), (process.env.CREATOROS_T1246_RUN_DIR! + "/original-output/.codex-tmp/t806-direct-error-regular.png")),
  timeout: 120000});
  expect(createBodies[0]?.retryOfTaskId).toBeUndefined();

  const terminalGetCount = taskGetCount;
  await page.waitForTimeout(4_500);
  expect(taskGetCount).toBe(terminalGetCount);

  // 真实刷新后由任务列表与步骤流恢复失败上下文，不依赖组件内存。
  await page.reload();
  await expect(page.locator('[data-slot="decisions-error"]')).toContainText(
    "如已有完成步骤，系统会保留",
  );
  await expect(page.locator('[data-slot="decision-error-detail"]')).toContainText(
    "SRT 解析不出任何字幕行",
  );
  await expect(button).toHaveText("继续上次分场");

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(button).toBeVisible();
  await page.locator('[data-slot="production-decisions"]').screenshot({
    path: resolve(process.cwd(), (process.env.CREATOROS_T1246_RUN_DIR! + "/original-output/.codex-tmp/t806-direct-error-compact.png")),
  timeout: 120000});
  await button.click();
  await expect.poll(() => createBodies.length, { timeout: 300000 }).toBe(2);
  expect(createBodies[1]?.retryOfTaskId).toBe(terminalTask.id);
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 36060000 });
