import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

const REQUEST_BUDGET = 120_000;
const tabs = [
  { label: "账户", id: "account" },
  { label: "偏好", id: "preferences" },
  { label: "外观", id: "appearance" },
  { label: "模型配置", id: "models" },
  { label: "数据服务", id: "data-services" },
  { label: "技能", id: "skills" },
  { label: "存储", id: "storage" },
] as const;

const slot = (page: Page, name: string) => page.locator(`[data-slot="${name}"]`);
const panel = (page: Page, id: string) =>
  page.locator(`[data-slot="settings-panel"][data-tab-id="${id}"]`);
const tab = (page: Page, label: string) =>
  page.getByRole("navigation", { name: "设置分类导航" }).getByRole("tab", { name: label, exact: true });

async function openSettingsFromAccounts(page: Page) {
  await page.goto("/accounts");
  await page.getByRole("navigation", { name: "主要导航" }).getByRole("link", { name: "设置", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/settings", { timeout: REQUEST_BUDGET });
  await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeVisible();
}

async function chooseCategory(page: Page, label: string, id: string) {
  await tab(page, label).click();
  await expect(tab(page, label)).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, id)).toBeVisible();
  for (const other of tabs.filter((item) => item.id !== id)) {
    await expect(panel(page, other.id)).toBeHidden();
  }
}

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type LayoutSnapshot = {
  viewport: { width: number; height: number };
  documentWidth: number;
  dialog: Rect;
  nav: Rect;
  panels: Rect;
  accountPanel: Rect;
  accountSectionCard: Rect;
  accountCard: Rect;
  accountIdentity: Rect;
  title: Rect;
  nickname: Rect;
  save: Rect;
  navScrollWidth: number;
  navClientWidth: number;
  navScrollHeight: number;
  navClientHeight: number;
  panelsScrollWidth: number;
  panelsClientWidth: number;
  cardScrollWidth: number;
  cardClientWidth: number;
  tabLabels: string[];
  tabRects: Rect[];
  tabOverflow: Array<{ scrollWidth: number; clientWidth: number }>;
};

async function readLayout(page: Page): Promise<LayoutSnapshot> {
  return page.evaluate(() => {
    const rect = (element: Element | null): Rect => {
      if (!element) throw new Error("设置布局测量缺少预期的真实DOM元素");
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const dialog = document.querySelector('[data-slot="settings-dialog"]');
    const nav = document.querySelector('[data-slot="settings-tabs"]');
    const panels = document.querySelector('[data-slot="settings-panels"]');
    const accountPanel = document.querySelector('[data-slot="settings-panel"][data-tab-id="account"]');
    const accountSectionCard = [...document.querySelectorAll('[data-slot="section-card"]')]
      .find((element) => element.querySelector('[data-slot="card-title"]')?.textContent?.trim() === "账户信息");
    const accountCard = document.querySelector('[data-slot="account-information-card"]');
    const accountIdentity = document.querySelector('[data-slot="account-identity"]');
    const title = [...document.querySelectorAll('[data-slot="section-card"] [data-slot="card-title"]')]
      .find((element) => element.textContent?.trim() === "账户信息");
    const nickname = document.querySelector('[data-slot="account-nickname-input"]');
    const save = document.querySelector('[data-slot="account-nickname-save"]');
    if (!(nav instanceof HTMLElement) || !(panels instanceof HTMLElement) || !(accountCard instanceof HTMLElement)) {
      throw new Error("设置布局测量缺少真实导航、正文或账户卡片");
    }
    const tabButtons = [...nav.querySelectorAll('[role="tab"]')];
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      dialog: rect(dialog),
      nav: rect(nav),
      panels: rect(panels),
      accountPanel: rect(accountPanel),
      accountSectionCard: rect(accountSectionCard ?? null),
      accountCard: rect(accountCard),
      accountIdentity: rect(accountIdentity),
      title: rect(title ?? null),
      nickname: rect(nickname),
      save: rect(save),
      navScrollWidth: nav.scrollWidth,
      navClientWidth: nav.clientWidth,
      navScrollHeight: nav.scrollHeight,
      navClientHeight: nav.clientHeight,
      panelsScrollWidth: panels.scrollWidth,
      panelsClientWidth: panels.clientWidth,
      cardScrollWidth: accountCard.scrollWidth,
      cardClientWidth: accountCard.clientWidth,
      tabLabels: tabButtons.map((button) => button.textContent?.trim() ?? ""),
      tabRects: tabButtons.map((button) => rect(button)),
      tabOverflow: tabButtons.map((button) => ({ scrollWidth: button.scrollWidth, clientWidth: button.clientWidth })),
    };
  });
}

function expectInside(inner: Rect, outer: Rect, label: string) {
  expect(inner.left, `${label}左边不能超出容器`).toBeGreaterThanOrEqual(outer.left - 1.5);
  expect(inner.right, `${label}右边不能超出容器`).toBeLessThanOrEqual(outer.right + 1.5);
}

async function capture(page: Page, info: TestInfo, name: string) {
  const directory = resolve(process.cwd(), "..", (process.env.CREATOROS_T1246_RUN_DIR! + "/original-output/t1237/browser-3925/visible-copy"));
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, `${name}.png`);
  await page.screenshot({ path, animations: "disabled", caret: "hide" , timeout: 120000});
  await info.attach(name, { path, contentType: "image/png" });
}

async function bounds(locator: Locator, label: string): Promise<Rect> {
  const value = await locator.boundingBox();
  expect(value, `${label}必须有真实可测量的布局矩形`).not.toBeNull();
  return {
    left: value!.x,
    top: value!.y,
    right: value!.x + value!.width,
    bottom: value!.y + value!.height,
    width: value!.width,
    height: value!.height,
  };
}

async function expectFullyVisibleInside(
  page: Page,
  locator: Locator,
  panels: Locator,
  dialog: Locator,
  label: string,
) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const [elementBox, panelsBox, dialogBox, viewport] = await Promise.all([
    bounds(locator, label),
    bounds(panels, "设置正文滚动区"),
    bounds(dialog, "设置弹窗"),
    page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);
  expectInside(elementBox, panelsBox, `${label}正文区域`);
  expectInside(elementBox, dialogBox, `${label}弹窗区域`);
  expect(elementBox.top, `${label}完整处于正文可视高度内`).toBeGreaterThanOrEqual(panelsBox.top - 1.5);
  expect(elementBox.bottom, `${label}完整处于正文可视高度内`).toBeLessThanOrEqual(panelsBox.bottom + 1.5);
  expect(elementBox.top, `${label}完整处于弹窗高度内`).toBeGreaterThanOrEqual(dialogBox.top - 1.5);
  expect(elementBox.bottom, `${label}完整处于弹窗高度内`).toBeLessThanOrEqual(dialogBox.bottom + 1.5);
  expect(elementBox.left, `${label}完整进入视口左侧`).toBeGreaterThanOrEqual(-1);
  expect(elementBox.top, `${label}完整进入视口上侧`).toBeGreaterThanOrEqual(-1);
  expect(elementBox.right, `${label}完整进入视口右侧`).toBeLessThanOrEqual(viewport.width + 1);
  expect(elementBox.bottom, `${label}完整进入视口下侧`).toBeLessThanOrEqual(viewport.height + 1);
  return elementBox;
}

async function verifyRedfoxLayout(page: Page, info: TestInfo, width: 390 | 683) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await chooseCategory(page, "数据服务", "data-services");
  const dialog = page.getByRole("dialog", { name: "设置", exact: true });
  const panels = slot(page, "settings-panels");
  const redfox = page.getByRole("region", { name: "RedFox 数据服务", exact: true });
  await expect(redfox).toBeVisible();
  await expect(panel(page, "data-services")).toContainText("RedFox 数据服务");
  const explanation = redfox.locator('[data-slot="card-description"]');
  await expect(explanation).toBeVisible();
  const explanationText = await explanation.textContent();
  expect(explanationText?.trim().length ?? 0, "RedFox说明需要有可读正文").toBeGreaterThan(0);
  const explanationRect = await expectFullyVisibleInside(page, explanation, panels, dialog, `${width}px RedFox说明`);
  const explanationCardBox = await bounds(redfox, "RedFox服务卡");
  expectInside(explanationRect, explanationCardBox, `${width}px RedFox说明服务卡`);
  const explanationMetrics = await explanation.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(explanationMetrics.scrollWidth).toBeLessThanOrEqual(explanationMetrics.clientWidth + 1);
  expect(explanationMetrics.scrollHeight).toBeLessThanOrEqual(explanationMetrics.clientHeight + 1);
  await capture(page, info, `settings-redfox-${width}-explanation`);

  const keyInput = redfox.locator("#redfox-key");
  const saveButton = redfox.getByRole("button", { name: "保存密钥", exact: true });
  await expect(keyInput).toHaveAttribute("type", "password");
  await expect(saveButton).toBeVisible();
  const keyRect = await expectFullyVisibleInside(page, keyInput, panels, dialog, `${width}px RedFox密钥输入框`);
  expectInside(keyRect, await bounds(redfox, "RedFox服务卡"), `${width}px RedFox密钥输入框服务卡`);
  const keyMetrics = await keyInput.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(keyMetrics.scrollWidth).toBeLessThanOrEqual(keyMetrics.clientWidth + 1);
  await capture(page, info, `settings-redfox-${width}-key-input`);
  const saveRect = await expectFullyVisibleInside(page, saveButton, panels, dialog, `${width}px RedFox保存按钮`);
  expectInside(saveRect, await bounds(redfox, "RedFox服务卡"), `${width}px RedFox保存按钮服务卡`);
  const saveMetrics = await saveButton.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(saveMetrics.scrollWidth).toBeLessThanOrEqual(saveMetrics.clientWidth + 1);
  await capture(page, info, `settings-redfox-${width}-save-button`);
  await info.attach(`settings-redfox-${width}-geometry`, {
    body: JSON.stringify({
      viewport: { width, height: width === 390 ? 844 : 900 },
      explanation: { text: explanationText?.trim(), rect: explanationRect, metrics: explanationMetrics },
      keyInput: { rect: keyRect, metrics: keyMetrics },
      saveButton: { rect: saveRect, metrics: saveMetrics },
      note: "仅测量真实只读界面；没有读取输入值、输入密钥、保存或请求RedFox上游。",
    }, null, 2),
    contentType: "application/json",
  });
}

async function verifyViewport(page: Page, info: TestInfo, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const dialog = page.getByRole("dialog", { name: "设置", exact: true });
  await expect(dialog).toBeVisible();
  await expect(tab(page, "账户")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, "account")).toBeVisible();

  for (const item of tabs) {
    await expect(tab(page, item.label)).toBeVisible();
    await expect(tab(page, item.label)).toContainText(item.label);
  }
  const snapshot = await readLayout(page);
  expect(snapshot.tabLabels).toEqual(tabs.map((item) => item.label));
  expect(snapshot.documentWidth).toBeLessThanOrEqual(width + 1);
  expect(snapshot.navScrollWidth).toBeLessThanOrEqual(snapshot.navClientWidth + 1);
  expect(snapshot.navScrollHeight).toBeLessThanOrEqual(snapshot.navClientHeight + 1);
  expect(snapshot.panelsScrollWidth).toBeLessThanOrEqual(snapshot.panelsClientWidth + 1);
  expect(snapshot.cardScrollWidth).toBeLessThanOrEqual(snapshot.cardClientWidth + 1);
  expect(snapshot.dialog.left).toBeGreaterThanOrEqual(-1);
  expect(snapshot.dialog.right).toBeLessThanOrEqual(width + 1);
  expect(snapshot.dialog.top).toBeGreaterThanOrEqual(-1);
  expect(snapshot.dialog.bottom).toBeLessThanOrEqual(height + 1);
  for (const [index, item] of snapshot.tabRects.entries()) {
    expectInside(item, snapshot.nav, `“${tabs[index]!.label}”分类按钮`);
    expect(item.top).toBeGreaterThanOrEqual(snapshot.nav.top - 1.5);
    expect(item.bottom).toBeLessThanOrEqual(snapshot.nav.bottom + 1.5);
    expect(snapshot.tabOverflow[index]!.scrollWidth).toBeLessThanOrEqual(snapshot.tabOverflow[index]!.clientWidth + 1);
  }
  expectInside(snapshot.accountSectionCard, snapshot.accountPanel, "账户信息卡片");
  expectInside(snapshot.accountCard, snapshot.accountSectionCard, "账户信息正文");
  expectInside(snapshot.accountIdentity, snapshot.accountCard, "账号身份行");
  expectInside(snapshot.title, snapshot.accountSectionCard, "账户信息标题");
  expectInside(snapshot.nickname, snapshot.accountSectionCard, "昵称输入框");
  expectInside(snapshot.save, snapshot.accountSectionCard, "昵称保存按钮");
  expect(snapshot.title.height, "账户卡标题应清楚显示为单行").toBeLessThan(40);

  if (width < 768) {
    expect(snapshot.nav.width).toBeGreaterThanOrEqual(snapshot.dialog.width - 2);
    expect(snapshot.nav.bottom).toBeLessThanOrEqual(snapshot.panels.top + 1.5);
    expect(snapshot.panels.width).toBeGreaterThanOrEqual(snapshot.dialog.width - 2);
  } else {
    expect(snapshot.nav.width).toBeGreaterThanOrEqual(160);
    expect(snapshot.nav.width).toBeLessThanOrEqual(200);
    expect(snapshot.nav.right).toBeLessThanOrEqual(snapshot.panels.left + 1.5);
    expect(snapshot.panels.left).toBeGreaterThan(snapshot.nav.left);
  }
  const columnStarts = new Set(snapshot.tabRects.map((item) => Math.round(item.left)));
  expect(columnStarts.size).toBe(width === 390 ? 2 : width === 683 ? 3 : 1);

  await capture(page, info, `settings-layout-${width}-overview`);
  await slot(page, "account-nickname-input").scrollIntoViewIfNeeded();
  await expect(slot(page, "account-nickname-input")).toBeInViewport();
  await expect(slot(page, "account-nickname-save")).toBeInViewport();
  const controlSnapshot = await readLayout(page);
  expectInside(controlSnapshot.nickname, controlSnapshot.accountCard, `${width}px昵称输入框可见态`);
  expectInside(controlSnapshot.save, controlSnapshot.accountCard, `${width}px昵称按钮可见态`);
  await capture(page, info, `settings-layout-${width}-draft-controls`);
  await info.attach(`settings-layout-${width}-geometry`, {
    body: JSON.stringify({ overview: snapshot, draftControls: controlSnapshot }, null, 2),
    contentType: "application/json",
  });
}

test("[T-1237] 设置在窄屏与桌面保持分类可达、正文完整和未提交草稿", async ({ page }, info) => {
  page.setDefaultTimeout(REQUEST_BUDGET);
  page.setDefaultNavigationTimeout(REQUEST_BUDGET);
  await openSettingsFromAccounts(page);

  // 未知 highlight 按原消费者无副作用，继续停留在默认账户分类。
  await page.goto("/settings?highlight=t1237-unknown");
  await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeVisible();
  await expect(tab(page, "账户")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, "account")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const item of tabs) {
    await chooseCategory(page, item.label, item.id);
  }
  await chooseCategory(page, "账户", "account");

  const draft = "T1237 未提交的中性昵称草稿";
  await slot(page, "account-nickname-input").fill(draft);
  await expect(slot(page, "account-nickname-save")).toBeEnabled();
  await chooseCategory(page, "偏好", "preferences");
  await chooseCategory(page, "账户", "account");
  await expect(slot(page, "account-nickname-input")).toHaveValue(draft);
  await expect(slot(page, "account-nickname-save")).toBeEnabled();

  await verifyViewport(page, info, 390, 844);
  await verifyViewport(page, info, 683, 900);
  await verifyViewport(page, info, 1536, 1024);
  await verifyRedfoxLayout(page, info, 390);
  await verifyRedfoxLayout(page, info, 683);

  // 已知深链仍选择并显示其原分类；不保存密钥、不调用外部服务。
  await page.goto("/settings?highlight=redfox");
  await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeVisible();
  await expect(tab(page, "数据服务")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, "data-services")).toBeVisible();
  await expect(panel(page, "data-services")).toContainText("RedFox 数据服务");

  await page.goto("/settings?highlight=t1237-unmapped");
  await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeVisible();
  await expect(tab(page, "账户")).toHaveAttribute("aria-selected", "true");
  await expect(panel(page, "account")).toBeVisible();

  // 通过真实tab获得焦点，再走浏览器Tab/Enter；Escape应按原合同返回前页。
  await openSettingsFromAccounts(page);
  await tab(page, "账户").click();
  await page.keyboard.press("Tab");
  await expect(tab(page, "偏好")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page, "preferences")).toBeVisible();
  await expect(panel(page, "account")).toBeHidden();
  await page.keyboard.press("Tab");
  await expect(tab(page, "外观")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page, "appearance")).toBeVisible();
  await expect(panel(page, "preferences")).toBeHidden();
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => url.pathname === "/accounts", { timeout: REQUEST_BUDGET });
  await expect(slot(page, "settings-dialog")).toHaveCount(0);
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 51780000 });
