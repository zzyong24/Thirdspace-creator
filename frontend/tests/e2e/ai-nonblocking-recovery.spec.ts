import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const visibleCopyPath = resolve(
  process.cwd(),
  "../orchestrator/evidence/T-1022-visible-copy.json",
);
let accountSequence = 0;
const visibleCopyCaptures: Array<{
  checkpoint: string;
  check_ids: string[];
  viewport: { width: number; height: number };
  text: string;
}> = [];

test.describe.configure({ mode: "serial" });

test.afterAll(() => {
  const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: resolve(process.cwd(), ".."),
    encoding: "utf8",
  }).trim();
  mkdirSync(resolve(visibleCopyPath, ".."), { recursive: true });
  writeFileSync(
    visibleCopyPath,
    `${JSON.stringify(
      {
        schema: "frontend-visible-copy/v1",
        task_id: "T-1022",
        commit_sha: commitSha,
        captures: visibleCopyCaptures,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});

async function captureVisibleCopy(page: Page, checkpoint: string, checkIds: string[]) {
  visibleCopyCaptures.push({
    checkpoint,
    check_ids: checkIds,
    viewport: page.viewportSize()!,
    text: await page.locator("body").innerText(),
  });
}

async function selectFreshAccount(page: Page, baseURL: string | undefined) {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json" },
    data: {
      id: "accounts.create",
      input: {
        body: {
          platform: "douyin",
          accountHandle: `@t1022-${++accountSequence}`,
        },
      },
    },
  });
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { data: { id: string } };
  await page.context().addCookies([
    {
      name: CURRENT_ACCOUNT_COOKIE,
      value: encodeURIComponent(payload.data.id),
      url: baseURL ?? "http://127.0.0.1",
    },
  ]);
  await page.addInitScript(
    ([key, id]) => window.localStorage.setItem(key!, id!),
    [CURRENT_ACCOUNT_KEY, payload.data.id],
  );
}

async function openAssistant(page: Page) {
  const historyHydrated = page.waitForResponse((response) => {
    if (!response.url().includes("/api/v1/dispatch")) return false;
    try {
      return response.request().postDataJSON()?.id === "ai.conversations.list";
    } catch {
      return false;
    }
  });
  await page.goto("/?copilot=open");
  await expect(page.locator("#ai-copilot-title")).toBeVisible();
  await historyHydrated;
  await page.waitForTimeout(100);
}

async function sendPrompt(page: Page, text: string) {
  await page.getByLabel("我能帮你做什么").fill(text);
  await page.getByLabel("提交提示给 Copilot").click();
}

function recoveredStream(text: string) {
  const chunks = [
    { type: "start", messageId: "assistant-t1022" },
    { type: "text-start", id: "text-t1022" },
    { type: "text-delta", id: "text-t1022", delta: text },
    { type: "text-end", id: "text-t1022" },
    { type: "finish" },
  ];
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`;
}

test("E2E-T1022-01 没有模型时保留输入并直达模型设置", async ({ page, baseURL }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "还没有可用的 AI 模型。完成设置后，回到这里即可继续。" }),
    }),
  );
  await selectFreshAccount(page, baseURL);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openAssistant(page);
  await sendPrompt(page, "保留这条输入，配置完成后继续");

  const card = page.locator('[data-slot="copilot-error"]');
  await expect(card).toContainText("完成 AI 设置后继续");
  await expect(card).toContainText("刚才输入的内容已经保留");
  await expect(card.locator('[data-slot="copilot-error-retry"]')).toHaveCount(0);
  await expect(card.locator('[data-slot="copilot-error-settings-link"]')).toHaveAttribute(
    "href",
    "/settings?highlight=text-model",
  );
  await captureVisibleCopy(page, "missing-model-regular", ["AC-T1022-MISSING-MODEL"]);
});

test("E2E-T1022-02 临时失败沿同一轮自动恢复并交付完整结果", async ({ page, baseURL }) => {
  let attempts = 0;
  const userMessageIds: string[] = [];
  await page.route("**/api/chat", async (route) => {
    attempts += 1;
    const body = route.request().postDataJSON() as {
      messages?: Array<{ id?: string; role?: string }>;
    };
    const userMessage = [...(body.messages ?? [])].reverse().find((message) => message.role === "user");
    if (userMessage?.id) userMessageIds.push(userMessage.id);
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary upstream failure" }),
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
        "x-conversation-id": "conversation-t1022",
        "x-execution-task-id": "execution-t1022",
      },
      body: recoveredStream("完整候选已自动恢复"),
    });
  });

  await selectFreshAccount(page, baseURL);
  await page.setViewportSize({ width: 900, height: 600 });
  await openAssistant(page);
  await sendPrompt(page, "生成一份完整候选");

  const card = page.locator('[data-slot="copilot-error"]');
  await expect(card).toContainText("正在恢复本轮生成");
  await expect(card).toContainText("输入和已完成内容已保留");
  await expect(card.locator('[data-slot="copilot-error-auto-recovery"]')).toBeVisible();
  await expect(card.locator('[data-slot="copilot-error-retry"]')).toHaveCount(0);
  await captureVisibleCopy(page, "transient-failure-auto-recovery-minimum", [
    "AC-T1022-AUTO-RECOVERY",
    "AC-T1022-SAME-TURN",
  ]);

  await expect(page.getByText("完整候选已自动恢复")).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(attempts).toBe(2);
  expect(userMessageIds).toHaveLength(2);
  expect(userMessageIds[1]).toBe(userMessageIds[0]);
  await captureVisibleCopy(page, "recovered-result-minimum", ["AC-T1022-COMPLETE"]);
});
