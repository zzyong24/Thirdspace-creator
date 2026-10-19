import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Page, Response, TestInfo } from "@playwright/test";
import { ENDPOINTS } from "@creatoros/contract";
import { expect, test } from "../helpers/test-environment";

// T1232: T501/DEC-MC-002 的设置 Dialog；保留单壳、原卡责任与 T606。
// 代表操作只写本轮 fresh 测试用户；不执行 Skill 定制、媒体迁移或宿主动作。
const REQUEST_BUDGET = 120_000;
const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);
const panel = (page: Page, id: string) =>
  page.locator(`[data-slot="settings-panel"][data-tab-id="${id}"]`);

function assertRawRedacted(value: unknown, fakeSecrets: readonly string[] = []) {
  // 必须检查 schema parse 前的 HTTP data；Zod strip 不能证明原回执脱敏。
  function visit(node: unknown) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      expect(["secret", "secretValue"].includes(key), "原 HTTP data 不得暴露密钥字段").toBe(false);
      visit(child);
    }
  }
  visit(value);
  for (const secret of fakeSecrets) {
    expect(JSON.stringify(value).includes(secret), "原 HTTP data 不得暴露本轮假明文").toBe(false);
  }
}

async function responseData(response: Response, fakeSecrets: readonly string[] = []) {
  expect(response.ok(), `真实操作 HTTP ${response.status()}`).toBe(true);
  const envelope = await response.json() as { data?: unknown };
  expect(envelope).toHaveProperty("data");
  assertRawRedacted(envelope.data, fakeSecrets);
  return envelope.data;
}

async function readPublic<T>(page: Page, endpoint: { id: string; response: { parse(value: unknown): T } }, fakeSecrets: readonly string[] = []) {
  const scope = await page.evaluate(() => ({
    groupId: localStorage.getItem("creatoros:current-group"),
    accountId: localStorage.getItem("creatoros:current-account"),
  }));
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: REQUEST_BUDGET,
    headers: {
      "content-type": "application/json",
      ...(scope.groupId ? { "x-group-id": scope.groupId } : {}),
      ...(scope.accountId ? { "x-account-id": scope.accountId } : {}),
    },
    data: { id: endpoint.id, input: {} },
  });
  expect(response.ok(), `${endpoint.id} HTTP ${response.status()}`).toBe(true);
  const envelope = await response.json() as { data?: unknown };
  expect(envelope).toHaveProperty("data");
  assertRawRedacted(envelope.data, fakeSecrets);
  return endpoint.response.parse(envelope.data);
}

function waitForUiOperation(page: Page, id: string) {
  return page.waitForResponse(response => {
    if (!response.url().endsWith("/api/v1/dispatch") || response.request().method() !== "POST") return false;
    return (response.request().postDataJSON() as { id?: string }).id === id;
  }, { timeout: REQUEST_BUDGET });
}

async function selectCategory(page: Page, name: string, id: string) {
  await page.getByRole("navigation", { name: "设置分类导航" }).getByRole("tab", { name, exact: true }).click();
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, id)).toBeVisible();
}

async function selectOption(page: Page, trigger: string, label: string) {
  await slot(page, trigger).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

async function captureBoth(page: Page, info: TestInfo, checkpoint: string, target: string) {
  const directory = resolve(process.cwd(), "..", "docs/verification/t1232/browser-3921/visible-copy");
  mkdirSync(directory, { recursive: true });
  for (const viewport of [{ width: 1536, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const visibleTarget = target === "settings-panel"
      ? page.locator('[data-slot="settings-panel"]:visible')
      : slot(page, target);
    await visibleTarget.scrollIntoViewIfNeeded();
    await expect(visibleTarget).toBeInViewport();
    const path = resolve(directory, `${info.testId}-${checkpoint}-${viewport.width}.png`);
    await page.screenshot({ path, animations: "disabled", caret: "hide" });
    await info.attach(`${checkpoint}-${viewport.width}`, { path, contentType: "image/png" });
  }
  await page.setViewportSize({ width: 1536, height: 1024 });
}

async function openFromAccounts(page: Page) {
  await page.goto("/accounts");
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "设置", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/settings", { timeout: REQUEST_BUDGET });
  await expect(slot(page, "settings-dialog")).toBeVisible();
}

async function startLocalTextFixture() {
  const modelName = "creatoros-t1232-local-text";
  const text = "本地流式文本探针已返回有效正文。";
  const protocols: Array<{ method: string; path: string; modelMatches: boolean; stream: boolean; messages: boolean; contentNonempty: boolean }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      let input: Record<string, unknown>;
      try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { response.writeHead(400).end(); return; }
      const valid = request.method === "POST" && request.url === "/v1/chat/completions" && input.model === modelName && input.stream === true && Array.isArray(input.messages);
      protocols.push({ method: request.method ?? "", path: request.url ?? "", modelMatches: input.model === modelName, stream: input.stream === true, messages: Array.isArray(input.messages), contentNonempty: valid && text.trim().length > 0 });
      if (!valid) { response.writeHead(400).end(); return; }
      // 仅按实际 OpenAI Chat stream 协议应答，不读取/匹配 prompt 语义，不记录 Authorization。
      const completion = { id: "chatcmpl-t1232-local", model: modelName, created: 1, object: "chat.completion.chunk" };
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(`data: ${JSON.stringify({ ...completion, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...completion, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`);
    });
  });
  server.requestTimeout = REQUEST_BUDGET;
  server.headersTimeout = REQUEST_BUDGET;
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("本地模型 fixture 未取得端口");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`, modelName, protocols,
    close: () => new Promise<void>((done, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : done()); }),
  };
}

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    // 原 T606 本体逐字不变；所有有限浏览器动作共同继承 LED-053 预算。
    page.setDefaultTimeout(REQUEST_BUDGET);
    page.setDefaultNavigationTimeout(REQUEST_BUDGET);
  });
  test("[T-606] 模型来源状态在桌面与 390px 都可辨认且本地表单可用", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1536, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/settings");
      await page.getByRole("tab", { name: "模型配置" }).click();
      const status = page.locator('[data-slot="model-authority-status"]');
      await expect(status).toBeVisible();
      await expect(status).toContainText("本地模型正在使用");
      await expect(
        page.locator('[data-slot="model-configuration-card"]'),
      ).toBeVisible();
    }
  });

  test("renders the settings structure on the /settings route", async ({ page }, info) => {
    await openFromAccounts(page);
    const header = slot(page, "app-top-header");
    await expect(header).toHaveAttribute("data-mode", "global");
    await expect(slot(page, "header-page-heading")).toContainText("设置");
    await expect(slot(page, "header-page-heading")).toContainText("账号、偏好与系统");
    // 模态背景仍是原壳，只从可访问树隐藏；DOM/当前路由不变量完整保留。
    const nav = slot(page, "sidebar-primary-nav");
    await expect(nav).toHaveAttribute("aria-label", "主要导航");
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("href", "/settings");
    await expect(page.locator('[data-slot="sidebar-contextual-card"][data-variant="assistant"]')).toHaveCount(1);
    await expect(slot(page, "app-shell")).toHaveCount(1);
    await expect(slot(page, "app-sidebar")).toHaveCount(1);
    await expect(slot(page, "app-top-header")).toHaveCount(1);
    await expect(page.locator('main[data-page="settings"]')).toHaveCount(1);
    await expect(page.getByRole("dialog", { name: "设置", exact: true })).toHaveCount(1);
    await expect(slot(page, "settings-dialog")).toContainText("账号、偏好与系统");
    await expect(page.getByRole("navigation", { name: "设置分类导航" })).toBeVisible();

    // 验证每项实际功能，不把当前分类数或排列顺序补签为 IA 全集。
    const categories = [
      { name: "账户", id: "account", cards: ["account-information-card", "activation-status-card", "check-update-card", "diagnostic-logs-card"] },
      { name: "偏好", id: "preferences", cards: ["preference-settings-card"] },
      { name: "外观", id: "appearance", cards: ["system-settings-card"] },
      { name: "模型配置", id: "models", cards: ["model-configuration-card"] },
      { name: "数据服务", id: "data-services", cards: [] },
      { name: "技能", id: "skills", cards: [] },
      { name: "存储", id: "storage", cards: ["storage-usage-card"] },
    ];
    let previous: string | undefined;
    for (const category of categories) {
      await selectCategory(page, category.name, category.id);
      if (previous && previous !== category.id) await expect(panel(page, previous)).toBeHidden();
      for (const card of category.cards) await expect(slot(page, card)).toBeVisible();
      if (category.id === "account") {
        await expect(slot(page, "activation-status-card")).toContainText("激活为桌面端功能");
        await expect(slot(page, "check-update-card")).toContainText("软件更新为桌面端功能");
        await expect(slot(page, "diagnostic-logs-card")).toContainText("诊断日志为桌面端功能");
      } else if (category.id === "data-services") {
        await expect(panel(page, category.id)).toContainText("RedFox 数据服务");
        await expect(page.locator("#redfox-key")).toHaveAttribute("type", "password");
      } else if (category.id === "skills") {
        await expect(slot(page, "skills-section").or(slot(page, "skills-empty"))).toBeVisible();
        const toggle = slot(page, "skill-row-toggle").first();
        if (await toggle.count()) {
          await toggle.click();
          await expect(slot(page, "skill-detail").first()).toBeVisible();
          await expect(slot(page, "skill-system-input").first()).toBeVisible();
        }
      } else if (category.id === "storage") {
        await expect(slot(page, "storage-root-path-input")).toBeVisible();
        await expect(slot(page, "storage-save-button")).toBeVisible();
        // 只读控件呈现；不保存路径、重置工作区或执行宿主功能。
      }
      previous = category.id;
    }
    for (const forbidden of ["team-settings-card", "permission-settings-card", "subscription-settings-card"]) {
      await expect(slot(page, forbidden)).toHaveCount(0);
    }

    // 点击建立真实焦点起点，再用 Tab/Enter/Space；不以 focus() 冒充键盘路径。
    await selectCategory(page, "账户", "account");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tab", { name: "偏好", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel(page, "preferences")).toBeVisible();
    await expect(panel(page, "account")).toBeHidden();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tab", { name: "外观", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(panel(page, "appearance")).toBeVisible();
    await expect(panel(page, "preferences")).toBeHidden();
    await captureBoth(page, info, "dialog-keyboard-appearance", "system-settings-card");

    await slot(page, "dialog-close").click();
    await page.waitForURL(url => url.pathname === "/accounts", { timeout: REQUEST_BUDGET });
    await expect(page.getByRole("navigation", { name: "主要导航" })).toBeVisible();
    await expect(slot(page, "settings-dialog")).toHaveCount(0);
    await openFromAccounts(page);
    await page.keyboard.press("Escape");
    await page.waitForURL(url => url.pathname === "/accounts", { timeout: REQUEST_BUDGET });
    await expect(page.getByRole("navigation", { name: "主要导航" })).toBeVisible();
    await expect(slot(page, "settings-dialog")).toHaveCount(0);
  });

  test("[T-1232] 账户昵称由真实 UI 保存并公开读回同用户及刷新", async ({ page }, info) => {
    await page.goto("/settings");
    const before = await readPublic(page, ENDPOINTS.getSettings);
    const displayName = "T1232 中性验收创作者";
    await slot(page, "account-nickname-input").fill(displayName);
    const saved = waitForUiOperation(page, "identity.profile.patch");
    await slot(page, "account-nickname-save").click();
    const result = ENDPOINTS.patchProfile.response.parse(await responseData(await saved));
    expect(result.id).toBe(before.id);
    expect(result.displayName).toBe(displayName);
    const reread = await readPublic(page, ENDPOINTS.getSettings);
    expect(reread.id).toBe(before.id);
    expect(reread.displayName).toBe(displayName);
    await page.reload();
    await expect(slot(page, "account-nickname-input")).toHaveValue(displayName);
    await captureBoth(page, info, "nickname-saved", "account-information-card");
  });

  test("[T-1232] 自动保存偏好由真实开关保存并读回 userId 及刷新", async ({ page }, info) => {
    await page.goto("/settings");
    const user = await readPublic(page, ENDPOINTS.getSettings);
    const before = await readPublic(page, ENDPOINTS.getPreferences);
    expect(before.userId).toBe(user.id);
    const desired = !before.autosaveEnabled;
    await selectCategory(page, "偏好", "preferences");
    await expect(slot(page, "pref-autosave-switch")).toHaveAttribute("aria-checked", String(before.autosaveEnabled));
    const saved = waitForUiOperation(page, "settings.preferences.patch");
    await slot(page, "pref-autosave-switch").click();
    const result = ENDPOINTS.patchPreferences.response.parse(await responseData(await saved));
    expect(result.userId).toBe(user.id);
    expect(result.autosaveEnabled).toBe(desired);
    const reread = await readPublic(page, ENDPOINTS.getPreferences);
    expect(reread.userId).toBe(user.id);
    expect(reread.autosaveEnabled).toBe(desired);
    await page.reload();
    await selectCategory(page, "偏好", "preferences");
    await expect(slot(page, "pref-autosave-switch")).toHaveAttribute("aria-checked", String(desired));
    await captureBoth(page, info, "user-preference-saved", "preference-settings-card");
  });

  test("[T-1232] 外观主题与密度按本地消费者持久并返回刷新", async ({ page }, info) => {
    await openFromAccounts(page);
    await selectCategory(page, "外观", "appearance");
    for (const choice of [{ label: "深色", value: "dark", dark: true }, { label: "浅色", value: "light", dark: false }]) {
      await selectOption(page, "sys-theme-trigger", choice.label);
      await expect(page.locator("html")).toHaveAttribute("data-theme", choice.value);
      expect(await page.locator("html").evaluate(root => root.classList.contains("dark"))).toBe(choice.dark);
      expect(await page.evaluate(() => localStorage.getItem("creatoros.settings.theme"))).toBe(choice.value);
    }
    await selectOption(page, "sys-density-trigger", "紧凑");
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
    expect(await page.evaluate(() => localStorage.getItem("creatoros.settings.density"))).toBe("compact");
    await selectCategory(page, "偏好", "preferences");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await slot(page, "dialog-close").click();
    await page.waitForURL(url => url.pathname === "/accounts", { timeout: REQUEST_BUDGET });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
    await openFromAccounts(page);
    await selectCategory(page, "外观", "appearance");
    await expect(slot(page, "sys-theme-trigger")).toContainText("浅色");
    await expect(slot(page, "sys-density-trigger")).toContainText("紧凑");
    await captureBoth(page, info, "appearance-persisted", "system-settings-card");
  });

  test("[T-1232] 默认本地模型真实保存及正式流式文本探针并脱敏读回", async ({ page }, info) => {
    const fixture = await startLocalTextFixture();
    const fakeSecret = "t1232-local-model-neutral-key";
    try {
      await page.goto("/settings");
      const user = await readPublic(page, ENDPOINTS.getSettings);
      await selectCategory(page, "模型配置", "models");
      await selectOption(page, "model-preset-trigger", "自定义");
      await expect(slot(page, "model-advanced-settings")).toBeVisible();
      await slot(page, "model-provider-input").fill("openai-compatible");
      await slot(page, "model-base-url-input").fill(fixture.baseUrl);
      await selectOption(page, "model-api-format-trigger", "OpenAI Chat 兼容");
      await slot(page, "model-name-input").fill(fixture.modelName);
      await expect(slot(page, "model-secret-input")).toHaveAttribute("type", "password");
      await slot(page, "model-secret-input").fill(fakeSecret);
      const saved = waitForUiOperation(page, "settings.models.put");
      const tested = waitForUiOperation(page, "settings.models.test");
      await slot(page, "model-test-connection").click();
      const config = ENDPOINTS.putModel.response.parse(await responseData(await saved, [fakeSecret]));
      expect(config.userId).toBe(user.id);
      expect(config.capability).toBe("default");
      expect(config.hasSecret).toBe(true);
      const probe = ENDPOINTS.testModelConnection.response.parse(await responseData(await tested, [fakeSecret]));
      expect(probe.ok).toBe(true);
      expect(probe.status ?? "ok").toBe("ok");
      expect(probe.detail).toBe("已按正式聊天通路完成流式回复,连通。");
      expect(probe.model).toBe(fixture.modelName);
      expect(fixture.protocols).toEqual([{ method: "POST", path: "/v1/chat/completions", modelMatches: true, stream: true, messages: true, contentNonempty: true }]);
      await expect(slot(page, "model-test-result")).toHaveAttribute("data-status", "ok");
      await expect(slot(page, "model-secret-input")).toHaveValue("");
      const models = await readPublic(page, ENDPOINTS.listModels, [fakeSecret]);
      expect(models.filter(model => model.capability === "default")).toHaveLength(1);
      const stored = models.find(model => model.capability === "default")!;
      expect(stored.id).toBe(config.id);
      expect(stored.userId).toBe(user.id);
      expect(stored.modelName).toBe(fixture.modelName);
      expect(stored.baseUrl).toBe(fixture.baseUrl);
      expect(stored.apiFormat).toBe("openai_chat");
      expect(stored.hasSecret).toBe(true);
      await info.attach("local-model-protocol", { body: JSON.stringify({ boundary: "仅本地协议 fixture，不是真实供应商认证", protocols: fixture.protocols }), contentType: "application/json" });
      await captureBoth(page, info, "local-model-probe-ok", "model-test-result");
      await page.reload();
      await selectCategory(page, "模型配置", "models");
      await expect(slot(page, "model-name-input")).toHaveValue(fixture.modelName);
      await expect(slot(page, "model-secret-input")).toHaveValue("");
      await expect(slot(page, "model-secret-status")).toContainText("已配置");
      const savedAgain = waitForUiOperation(page, "settings.models.put");
      await slot(page, "model-save").click();
      expect(ENDPOINTS.putModel.response.parse(await responseData(await savedAgain, [fakeSecret])).hasSecret).toBe(true);
      const reread = (await readPublic(page, ENDPOINTS.listModels, [fakeSecret])).find(model => model.id === config.id);
      expect(reread?.hasSecret).toBe(true);
      expect(fixture.protocols).toHaveLength(1); // 仅保存不能再调用模型。
      await page.reload();
      await selectCategory(page, "模型配置", "models");
      await expect(slot(page, "model-secret-input")).toHaveValue("");
      await expect(slot(page, "model-secret-status")).toContainText("已配置");
    } finally { await fixture.close(); }
  });

  test("[T-1232] RedFox 密钥真实保存及移除公开脱敏读回并刷新", async ({ page }, info) => {
    const fakeSecret = "t1232-redfox-neutral-key";
    await page.goto("/settings");
    await selectCategory(page, "数据服务", "data-services");
    const input = page.locator("#redfox-key");
    await expect(input).toHaveAttribute("type", "password");
    await input.fill(fakeSecret);
    const saved = waitForUiOperation(page, "settings.redfox.put");
    await page.getByRole("button", { name: "保存密钥", exact: true }).click();
    const result = ENDPOINTS.putRedfox.response.parse(await responseData(await saved, [fakeSecret]));
    expect(result.provider).toBe("redfox");
    expect(result.configured).toBe(true);
    expect(result.updatedAt).not.toBeNull();
    await expect(input).toHaveValue("");
    expect((await readPublic(page, ENDPOINTS.getRedfox, [fakeSecret])).configured).toBe(true);
    await page.reload();
    await selectCategory(page, "数据服务", "data-services");
    await expect(panel(page, "data-services")).toContainText("已保存密钥");
    await expect(input).toHaveValue("");
    await captureBoth(page, info, "redfox-saved", "settings-panel");
    const removed = waitForUiOperation(page, "settings.redfox.delete");
    await page.getByRole("button", { name: "移除密钥", exact: true }).click();
    expect(ENDPOINTS.deleteRedfox.response.parse(await responseData(await removed, [fakeSecret])).configured).toBe(false);
    expect((await readPublic(page, ENDPOINTS.getRedfox, [fakeSecret])).configured).toBe(false);
    await page.reload();
    await selectCategory(page, "数据服务", "data-services");
    await expect(panel(page, "data-services")).toContainText("尚未配置");
    await expect(input).toHaveValue("");
    await expect(page.getByRole("button", { name: "移除密钥", exact: true })).toHaveCount(0);
    await captureBoth(page, info, "redfox-removed", "settings-panel");
  });
});
