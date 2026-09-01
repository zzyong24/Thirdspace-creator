import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";

async function selectFreshAccount(
  page: Page,
  baseURL: string | undefined,
) {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json" },
    data: {
      id: "accounts.create",
      input: {
        params: undefined,
        query: undefined,
        body: {
          platform: "douyin",
          accountHandle: `@t913-${Date.now()}`,
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
  // listConversations 返回后，等 React 把“空历史”提交完再发本轮，避免恢复 effect 清掉新消息。
  await page.waitForTimeout(100);
}

async function sendPrompt(
  page: Page,
  text: string,
) {
  await page.getByLabel("我能帮你做什么").fill(text);
  await page.getByLabel("提交提示给 Copilot").click();
}

test("E2E-T913-01 模型未配置时直接打开模型配置", async ({ page, baseURL }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "还没有可用的 AI 模型。完成设置后，回到这里即可继续。",
      }),
    }),
  );
  await selectFreshAccount(page, baseURL);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openAssistant(page);
  await sendPrompt(page, "帮我生成一版定位");

  const card = page.locator('[data-slot="copilot-error"]');
  await expect(card).toContainText("完成 AI 设置后继续");
  await expect(card).toContainText("刚才输入的内容已经保留");
  const settings = card.locator('[data-slot="copilot-error-settings-link"]');
  await expect(settings).toHaveAttribute("href", "/settings?highlight=text-model");
  await page.waitForTimeout(300);
  await card.screenshot({
    path: resolve(process.cwd(), "../.codex-tmp/t913-model-recovery.png"),
  });

  await settings.click();
  await expect(page).toHaveURL(/\/settings\?highlight=text-model/);
  await expect(page.locator('[data-highlight="text-model"]')).toBeVisible();
});

test("E2E-T913-02 定位缺失时直达定位中心", async ({ page, baseURL }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "当前账号还没有可用定位。先生成并保存一版定位，再回来继续。",
      }),
    }),
  );
  await selectFreshAccount(page, baseURL);
  await page.setViewportSize({ width: 900, height: 600 });
  await openAssistant(page);
  await sendPrompt(page, "基于我的定位给五个选题");

  const card = page.locator('[data-slot="copilot-error"]');
  await expect(card).toContainText("先完成账号定位");
  await expect(card.locator('[data-slot="copilot-error-settings-link"]')).toHaveCount(0);
  const positioning = card.locator('[data-slot="copilot-error-positioning-link"]');
  await expect(positioning).toHaveAttribute("href", "/positioning");
  const bounds = await Promise.all([card.boundingBox(), positioning.boundingBox()]);
  expect(bounds[0]).not.toBeNull();
  expect(bounds[1]).not.toBeNull();
  expect(bounds[1]!.x).toBeGreaterThanOrEqual(bounds[0]!.x);
  expect(bounds[1]!.x + bounds[1]!.width).toBeLessThanOrEqual(
    bounds[0]!.x + bounds[0]!.width,
  );
  const scroll = page.locator('[data-slot="copilot-message-scroll"]');
  expect(
    await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page.waitForTimeout(300);
  await card.screenshot({
    path: resolve(process.cwd(), "../.codex-tmp/t913-positioning-recovery-compact.png"),
  });

  await positioning.click();
  await expect(page).toHaveURL(/\/positioning$/);
  await expect(page.locator('[data-slot="positioning-center"]')).toBeVisible();
});

test("E2E-T913-03 自带 AI 额度不足时只显示真实额度入口", async ({ page, baseURL }) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "AI 额度不足，请充值后再试。" }),
    }),
  );
  await selectFreshAccount(page, baseURL);
  await openAssistant(page);
  await sendPrompt(page, "生成口播稿");

  const card = page.locator('[data-slot="copilot-error"]');
  await expect(card).toContainText("AI 额度需要补充");
  await expect(card.getByRole("button", { name: "查看额度并充值" })).toBeVisible();
  await expect(card.locator('[data-slot="copilot-error-settings-link"]')).toHaveCount(0);
  await expect(card.locator('[data-slot="copilot-error-retry"]')).toHaveCount(0);
});

test("E2E-T913-04 / E2E-T913-05 未知故障可重试且不泄露内部状态", async ({
  page,
  baseURL,
}) => {
  let attempts = 0;
  await page.route("**/api/chat", (route) => {
    attempts += 1;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "opaque-internal-failure" }),
    });
  });
  await selectFreshAccount(page, baseURL);
  await openAssistant(page);
  await sendPrompt(page, "帮我分析这条内容");

  const card = page.locator('[data-slot="copilot-error"]');
  await expect(card).toContainText("这次没有生成成功");
  await expect(card).toContainText("刚才输入的内容还在");
  await expect(card).not.toContainText(/activation|Growth|authority|API Key|opaque/i);
  await card.locator('[data-slot="copilot-error-retry"]').click();
  await expect.poll(() => attempts).toBe(2);
});
