import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const CHECK_IDS = [
  "AC-PUBLISH-PACK-RICH-REVISION",
  "AC-PUBLISH-PACK-SINGLE-LINE",
  "AC-PUBLISH-PACK-REFRESH",
  "AC-PUBLISH-STATUS-PRESERVED",
];

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

async function selectAccount(page: Page, accountId: string, baseURL?: string) {
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

test("查看发布物料优先回读完整简介与标签，刷新和小窗口仍保持", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const captures: Array<{
    checkpoint: string;
    check_ids: string[];
    viewport: { width: number; height: number };
    text: string;
  }> = [];
  const account = await dispatch<{ id: string }>(page, "accounts.create", {
    params: undefined,
    query: undefined,
    body: {
      platform: "douyin",
      accountHandle: `@e2e-t849-publish-${Date.now()}`,
    },
  });
  const project = await dispatch<{ id: string }>(
    page,
    "projects.create",
    {
      params: undefined,
      query: undefined,
      body: { title: "发布物料回读真实验收", brief: "" },
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
      body: {
        contentText: "三个账号的素材要先拆成可复用资产，再分别投放。",
        changeSummary: "发布物料浏览器验收稿",
      },
    },
    account.id,
  );
  const output = await dispatch<{ id: string }>(
    page,
    "projects.outputs.create",
    {
      params: { projectId: project.id },
      query: undefined,
      body: { title: "主视频", contentRole: "conversion" },
    },
    account.id,
  );

  // 先建完整生成物料，再建较新的标题型发布事实，复现旧实现固定取列表首项的失败形状。
  const publishPackage = await dispatch<{ id: string }>(
    page,
    "outputs.publications.create",
    {
      params: { outputId: output.id },
      query: undefined,
      body: { platform: "douyin", accountReference: account.id },
    },
    account.id,
  );
  await dispatch(
    page,
    "publications.revisions.create",
    {
      params: { publicationId: publishPackage.id },
      query: undefined,
      body: {
        title: "三个号素材全混？我用AI 20秒拆成可复用资产",
        description: "第一段简介。\n\n第二段简介。\t收尾。",
        platformTags: ["AI提效", "素材库搭建"],
      },
    },
    account.id,
  );
  await dispatch(
    page,
    "outputs.publications.register",
    {
      params: { outputId: output.id },
      query: undefined,
      body: {
        platform: "douyin",
        externalId: `74230000${Date.now()}`,
        externalUrl: `https://www.douyin.com/video/74230000${Date.now()}`,
        title: "同时运营3个账号素材全混？",
      },
    },
    account.id,
  );
  await selectAccount(page, account.id, baseURL);

  const assertDialog = async () => {
    await page.getByRole("button", { name: "查看发布物料" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("三个号素材全混？我用AI 20秒拆成可复用资产");
    await expect(dialog).toContainText("第一段简介。 第二段简介。 收尾。");
    await expect(dialog).toContainText("# AI提效");
    await expect(dialog).toContainText("# 素材库搭建");
    await expect(dialog).not.toContainText("暂无正文");
    await expect(dialog).not.toContainText("暂无标签");
    return dialog;
  };

  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByText(/已发布/).first()).toBeVisible();
  await expect(page.getByText("登记已发布", { exact: true })).toHaveCount(0);
  let dialog = await assertDialog();
  captures.push({
    checkpoint: "desktop-publish-package-dialog",
    check_ids: [...CHECK_IDS],
    viewport: { width: 1536, height: 1024 },
    text: await dialog.innerText(),
  });

  await page.reload();
  dialog = await assertDialog();
  await page.setViewportSize({ width: 900, height: 720 });
  const fitsViewport = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= window.innerWidth &&
      rect.bottom <= window.innerHeight
    );
  });
  expect(fitsViewport).toBe(true);
  captures.push({
    checkpoint: "compact-refresh-publish-package-dialog",
    check_ids: [...CHECK_IDS],
    viewport: { width: 900, height: 720 },
    text: await dialog.innerText(),
  });

  const repoRoot = resolve(process.cwd(), "..");
  const evidenceDir = resolve(repoRoot, "orchestrator", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const visibleCopy = `${JSON.stringify(
    {
      schema: "frontend-visible-copy/v1",
      task_id: "T-849",
      commit_sha: commitSha,
      captures,
    },
    null,
    2,
  )}\n`;
  writeFileSync(resolve(evidenceDir, "T-849-visible-copy.json"), visibleCopy);
  expect(createHash("sha256").update(visibleCopy).digest("hex")).toHaveLength(64);
});
