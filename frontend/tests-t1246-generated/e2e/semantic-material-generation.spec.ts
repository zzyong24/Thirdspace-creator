import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const CHECK_IDS = [
  "AC-MATERIAL-BUTTONS",
  "AC-IMAGE-MULTI-SEGMENT-PREFILL",
  "AC-VIDEO-SINGLE-DEFAULT-PREFILL",
  "AC-MATERIAL-NO-AUTO-SEND",
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
  timeout: 120000});
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

test("图片按确认稿需要预填多个候选，视频默认预填一个候选，点击不自动发送", async ({
  page,
  baseURL,
}) => {
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
      accountHandle: `@e2e-t836-material-${Date.now()}`,
    },
  });
  const project = await dispatch<{ id: string }>(
    page,
    "projects.create",
    {
      params: undefined,
      query: undefined,
      body: { title: "稿件语义生成素材真实验收", brief: "" },
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
        contentText: [
          "工具变多并不等于流程变清楚。真正的问题是任务没有拆开，换多少模型都只是在传递同一个混乱的纸箱。",
          "先把输入、判断和交付拆成三个独立环节，每个环节只解决一个问题，团队才知道卡点究竟在哪里。",
          "最后再让 AI 串起这些环节，它承担的是理解和编排，不是用一张万能海报掩盖所有信息。",
        ].join("\n\n"),
        changeSummary: "浏览器验收确认稿",
      },
    },
    account.id,
  );
  await selectAccount(page, account.id, baseURL);

  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto(`/projects/${project.id}`);
  const imageButton = page.getByRole("button", { name: "生成图片素材" });
  const videoButton = page.getByRole("button", { name: "生成视频素材" });
  const input = page.getByLabel("我能帮你做什么");
  await expect(imageButton).toBeVisible();
  await expect(videoButton).toBeVisible();
  const messageCount = await page.locator('[data-slot="copilot-message"]').count();

  await imageButton.click();
  await expect(input).toHaveValue(/先读取当前确认稿/);
  await expect(input).toHaveValue(/根据稿件篇幅/);
  await expect(input).toHaveValue(/选择多个/);
  await expect(input).toHaveValue(/每个段落各生成一张/);
  await expect(input).not.toHaveValue(/唯一服务段落/);
  expect(await page.locator('[data-slot="copilot-message"]').count()).toBe(messageCount);
  const imagePrefill = await input.inputValue();
  expect(imagePrefill).not.toContain("context.artifact.text");
  expect(imagePrefill).not.toContain("material.generate");

  await videoButton.click();
  await expect(input).toHaveValue(/先读取当前确认稿/);
  await expect(input).toHaveValue(/连续短镜头/);
  await expect(input).toHaveValue(/默认只生成一个/);
  await expect(input).toHaveValue(/控制生成成本/);
  await expect(input).toHaveValue(/除非我明确要求/);
  expect(await page.locator('[data-slot="copilot-message"]').count()).toBe(messageCount);
  const videoPrefill = await input.inputValue();
  captures.push({
    checkpoint: "desktop-semantic-material-buttons",
    check_ids: [...CHECK_IDS],
    viewport: { width: 1536, height: 1024 },
    text: `生成图片素材\n生成视频素材\n${imagePrefill}\n${videoPrefill}`,
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  // 最小窗口会按既有响应式规则收起右栏；从侧栏真实入口重新打开同一 Copilot。
  if (!(await imageButton.isVisible())) {
    await page.getByText("打开 AI 助手", { exact: true }).click();
  }
  await expect(imageButton).toBeVisible();
  await expect(videoButton).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  captures.push({
    checkpoint: "minimum-semantic-material-buttons",
    check_ids: [...CHECK_IDS],
    viewport: { width: 1024, height: 768 },
    text: `生成图片素材\n生成视频素材\n${videoPrefill}`,
  });

  const repoRoot = resolve(process.cwd(), "..");
  const evidenceDir = resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const visibleCopy = `${JSON.stringify(
    {
      schema: "frontend-visible-copy/v1",
      task_id: "T-854",
      commit_sha: commitSha,
      captures,
    },
    null,
    2,
  )}\n`;
  writeFileSync(resolve(evidenceDir, "T-854-visible-copy.json"), visibleCopy);
  expect(createHash("sha256").update(visibleCopy).digest("hex")).toHaveLength(64);
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 12900000 });
