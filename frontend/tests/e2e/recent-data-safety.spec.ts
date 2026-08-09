import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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
    ([key, id]) => window.localStorage.setItem(key!, id!),
    [CURRENT_ACCOUNT_KEY, accountId],
  );
}

function writeVisibleCopy(
  taskId: string,
  captures: ReadonlyArray<{
    checkpoint: string;
    check_ids: ReadonlyArray<string>;
    viewport: { width: number; height: number };
    text: string;
  }>,
) {
  const repoRoot = resolve(process.cwd(), "..");
  const evidenceDir = resolve(repoRoot, "orchestrator", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  writeFileSync(
    resolve(evidenceDir, `${taskId}-visible-copy.json`),
    `${JSON.stringify(
      {
        schema: "frontend-visible-copy/v1",
        task_id: taskId,
        commit_sha: commitSha,
        captures,
      },
      null,
      2,
    )}\n`,
  );
}

test("已有定位进入 Copilot 前采时，正式母版、历史和旧会话始终可见", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const account = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined,
    query: undefined,
    body: {
      platform: "douyin",
      accountHandle: `@e2e-positioning-safety-${Date.now()}`,
    },
  });
  await dispatch(page, "positioning.profile.upsert", {
    params: undefined,
    query: undefined,
    body: {
      persona: "湖南餐饮经营者",
      field: "湖南餐饮行业 IP",
      audience: "准备改善门店经营的本地餐饮老板",
      differentiation: "只讲真实门店验证过的方法",
      capabilities: ["门店经营", "内容表达"],
    },
  }, account.id);
  await dispatch(page, "positioning.statements.create", {
    params: undefined,
    query: undefined,
    body: {
      oneLiner: "帮湖南餐饮老板把门店经验变成可信、可执行的内容",
      keywords: ["湖南餐饮", "门店经营", "实战复盘"],
      productAnchorIds: [],
      changeReason: "定位数据安全真实旅程",
    },
  }, account.id);
  await dispatch(page, "positioning.discovery.start", {
    params: undefined,
    query: undefined,
    body: { sourceMode: "scratch" },
  }, account.id);
  await selectAccount(page, account.id, baseURL);

  const captures: Array<{
    checkpoint: string;
    check_ids: ReadonlyArray<string>;
    viewport: { width: number; height: number };
    text: string;
  }> = [];
  const checkIds = [
    "AC-POSITIONING-MASTER",
    "AC-POSITIONING-DRAFT",
    "AC-POSITIONING-COPILOT-ENTRY",
  ];

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/positioning");
  const center = page.getByTestId("positioning-center");
  await expect(center).toContainText("当前定位母版");
  await expect(center).toContainText(
    "帮湖南餐饮老板把门店经验变成可信、可执行的内容",
  );
  await expect(center).toContainText("版本历史");
  const copilotEntry = page.getByTestId("positioning-copilot-entry");
  await expect(copilotEntry).toBeVisible();
  await expect(copilotEntry).toContainText("用 Copilot 把定位聊清楚");
  await expect(copilotEntry).toContainText("已恢复 0 条旧前采信息 · 重新定位");
  await expect(copilotEntry).toContainText("未采纳前不改当前母版");
  const copilotLink = page.getByTestId("positioning-open-copilot");
  await expect(copilotLink).toHaveAttribute("href", /copilot=open/);
  await expect(copilotLink).toHaveAttribute("href", /fn=positioning\.generate/);
  await expect(copilotLink).toHaveAttribute("href", /scope=surface%3Apositioning/);
  await expect(center).toContainText("帮湖南餐饮老板把门店经验变成可信、可执行的内容");
  captures.push({
    checkpoint: "official-master-with-scratch-discovery",
    check_ids: checkIds,
    viewport: { width: 1440, height: 900 },
    text: await center.innerText(),
  });

  await page.setViewportSize({ width: 1024, height: 720 });
  await expect(center).toContainText("当前定位母版");
  await expect(copilotEntry).toBeVisible();
  captures.push({
    checkpoint: "official-master-with-scratch-minimum-window",
    check_ids: checkIds,
    viewport: { width: 1024, height: 720 },
    text: await center.innerText(),
  });

  writeVisibleCopy("T-657", captures);
  writeVisibleCopy("T-666", captures);
});

test("信源确认删除后从工作台消失，并展示真实级联清理结果", async ({
  page,
  baseURL,
}) => {
  const sourceName = `待彻底删除信源-${Date.now()}`;
  const account = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined,
    query: undefined,
    body: {
      platform: "douyin",
      accountHandle: `@e2e-source-delete-${Date.now()}`,
    },
  });
  const created = await dispatch<{ source: { id: string } }>(
    page,
    "intelligence.sources.create",
    {
      params: undefined,
      query: undefined,
      body: {
        accountId: account.id,
        collectionId: null,
        type: "web",
        config: { type: "web", url: "https://example.com/creatoros-source" },
        displayName: sourceName,
        monitorEnabled: false,
        runInitial: false,
        idempotencyKey: `e2e-delete-${Date.now()}`,
      },
    },
    account.id,
  );
  await selectAccount(page, account.id, baseURL);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/intelligence");
  const sourceRow = page.getByTestId(`radar-source-row-${created.source.id}`);
  await expect(sourceRow).toContainText(sourceName);
  await page.getByRole("button", { name: `移除 ${sourceName}` }).click();
  await expect(
    page.getByRole("heading", { name: `删除「${sourceName}」及其内容？` }),
  ).toBeVisible();
  await page.getByRole("button", { name: "删除信源与内容" }).click();
  await expect(sourceRow).toHaveCount(0);
  const status = page.getByRole("status");
  await expect(status).toContainText(`已删除「${sourceName}」及 0 条独占内容`);

  const checkIds = ["AC-SOURCE-DELETE", "AC-SOURCE-DISAPPEAR"];
  const captures = [
    {
      checkpoint: "source-deleted-normal",
      check_ids: checkIds,
      viewport: { width: 1440, height: 900 },
      text: await page.locator("body").innerText(),
    },
  ];
  await page.setViewportSize({ width: 1024, height: 720 });
  await expect(status).toContainText("正式选题、项目引用的内容已安全保留");
  captures.push({
    checkpoint: "source-deleted-minimum-window",
    check_ids: checkIds,
    viewport: { width: 1024, height: 720 },
    text: await page.locator("body").innerText(),
  });
  writeVisibleCopy("T-665", captures);
});
