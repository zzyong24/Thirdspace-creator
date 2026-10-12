import type { BrowserContext, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AccountGroupResource, PlatformAccountResource } from "@creatoros/contract";
import { expect, test } from "../helpers/test-environment";

const output = resolve((process.env.CREATOROS_T1246_RUN_DIR! + "/original-output/t1159"));
const wait = { timeout: 120_000 };
const viewports = [{ width: 1366, height: 900 }, { width: 900, height: 900 }, { width: 390, height: 900 }];
async function dispatch<T>(page: Page, id: string, input: unknown, groupId?: string, accountId?: string): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    ...wait, headers: { "content-type": "application/json", ...(groupId ? { "x-group-id": groupId } : {}), ...(accountId ? { "x-account-id": accountId } : {}) }, data: { id, input },
  timeout: 120000});
  expect(response.ok(), `${id}: HTTP ${response.status()}`).toBe(true);
  return (await response.json()).data;
}
async function selectGroup(page: Page, context: BrowserContext, baseURL: string, groupId: string) {
  await context.addCookies([{ name: "creatoros_current_group", value: encodeURIComponent(groupId), url: baseURL }]);
  await page.addInitScript(id => { localStorage.setItem("creatoros:current-group", id); localStorage.removeItem("creatoros:current-account"); }, groupId);
}

test("T1159 两微信账号从组成员进入真实0报告，刷新返回与身份拒绝", async ({ page, context, baseURL }) => {
  // T1166：准备8 + 窗口24×6 + 身份24×2，至多200个120秒串行点，再留1200秒结算。
  test.setTimeout(Math.max((25_200_000), 25200000));
  page.setDefaultTimeout(120_000); page.setDefaultNavigationTimeout(120_000);
  mkdirSync(resolve(output, "screenshots"), { recursive: true });
  const group = await dispatch<AccountGroupResource>(page, "accountGroups.create", { body: { name: "微信报表入口验收", idempotencyKey: crypto.randomUUID() } });
  await dispatch<AccountGroupResource>(page, "accountGroups.create", { body: { name: "管理操作验收目标组", idempotencyKey: crypto.randomUUID() } });
  const accounts: PlatformAccountResource[] = [];
  for (const [platform, name] of [["wechatVideo", "中性视频号账号"], ["wechatOfficial", "中性公众号账号"]] as const) {
    const account = await dispatch<PlatformAccountResource>(page, "accounts.create", { body: { platform, accountHandle: name, idempotencyKey: crypto.randomUUID() } }, group.id);
    expect(account.externalAccountId).toBeNull(); accounts.push(account);
  }
  await selectGroup(page, context, baseURL!, group.id);
  const captures: { name: string; text: string; viewport: { width: number; height: number } | null; check_ids: string[] }[] = [];
  const observations: unknown[] = [];
  let bindingStarts = 0;
  page.on("request", request => {
    if (!request.url().endsWith("/api/v1/dispatch") || request.method() !== "POST") return;
    const id = request.postDataJSON()?.id;
    if (id === "accounts.bind.start" || id === "platforms.bind.begin") bindingStarts++;
  });
  for (const account of accounts) {
    const read = () => dispatch<{ items: unknown[]; total: number; nextCursor: string | null }>(page, "platforms.reports.list", { params: { accountId: account.id }, query: { pageSize: 20, cursor: null } }, group.id, account.id);
    const before = await read(); expect(before).toEqual({ items: [], total: 0, nextCursor: null });
    for (const viewport of viewports) {
      await page.setViewportSize(viewport); await page.goto("/accounts", wait);
      await expect(page.getByRole("heading", { name: "账号组与绑定账号", exact: true })).toBeVisible(wait);
      const link = page.getByRole("link", { name: `查看${account.accountHandle}的数据`, exact: true });
      await expect(link).toHaveAttribute("href", `/accounts/works?accountId=${encodeURIComponent(account.id)}`, wait);
      const member = link.locator("xpath=ancestor::li[1]");
      await member.locator("summary").click(wait);
      await expect(member.getByRole("button", { name: "隐藏", exact: true })).toBeVisible(wait);
      const transferTrigger=member.getByRole("button", { name: "转组", exact: true });
      await transferTrigger.click(wait);
      const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible(wait);
      await expect(dialog.getByRole("button", { name: "查看转组影响", exact: true })).toBeVisible(wait);
      await page.keyboard.press("Escape"); await expect(dialog).toBeHidden(wait); await expect(transferTrigger).toBeFocused(wait);
      await link.click(wait);
      const panel = page.getByTestId("native-report-panel");
      await expect(panel).toHaveAttribute("data-account-id", account.id, wait);
      await expect(panel.getByRole("heading", { name: `${account.accountHandle}的作品与数据`, exact: true })).toBeVisible(wait);
      await expect(panel.getByText("尚无后台报表。同步后可查看当前账号数据。", { exact: true })).toBeVisible(wait);
      await expect(panel.getByRole("button", { name: "同步数据", exact: true })).toBeEnabled(wait);
      expect(await panel.getByRole("heading", {level:1}).evaluate(element=>getComputedStyle(element).fontSize)).toBe("24px");
      const name = `${account.platform}-empty-${viewport.width}`;
      await page.screenshot({ path: resolve(output, "screenshots", `${name}.png`) , timeout: 120000});
      captures.push({ name, viewport, text: await panel.innerText(), check_ids: ["AC-REPORT-ENTRY", "AC-UI"] });
      await page.reload(wait); await expect(panel).toHaveAttribute("data-account-id", account.id, wait); expect(await read()).toEqual(before);
      await panel.getByRole("link", { name: "返回账号", exact: true }).click(wait); await expect(link).toBeVisible(wait);
    }
    // 公共start实际拒绝：不替换成功或失败响应，不开始扫码/采集/下载。
    await page.setViewportSize(viewports[0]!); await page.goto(`/accounts/works?accountId=${encodeURIComponent(account.id)}`, wait);
    const panel = page.getByTestId("native-report-panel");
    const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/v1/dispatch") && response.request().postDataJSON()?.id === "platforms.collections.start", wait);
    await panel.getByRole("button", { name: "同步数据", exact: true }).click(wait);
    const response = await responsePromise; expect(response.status()).toBeGreaterThanOrEqual(400); expect(response.status()).toBeLessThan(500);
    const failure = await response.json(); expect(failure.error.code).toBe("SCOPE_MISSING");
    await expect(panel.getByRole("alert")).toContainText("请先扫码绑定这个账号，再同步数据。", wait);

    const recovery=panel.getByRole("button", { name: "扫码绑定账号", exact: true });
    await expect(recovery).toBeVisible(wait);await expect(panel.locator('header').getByRole('button',{name:'扫码绑定账号',exact:true})).toBeEnabled(wait);
    await expect(panel.getByRole('button',{name:'同步数据',exact:true})).toHaveCount(0,wait);
    await expect(panel.getByText('尚无后台报表。完成扫码后，可同步当前账号数据。',{exact:true})).toBeVisible(wait);
    await recovery.click(wait);const binding=page.getByRole('dialog');await expect(binding).toBeVisible(wait);
    await page.keyboard.press('Escape');await expect(binding).toBeHidden(wait);await expect(recovery).toBeFocused(wait);

    expect(await read()).toEqual(before);
    const name = `${account.platform}-identity-required`;
    await page.screenshot({ path: resolve(output, "screenshots", `${name}.png`) , timeout: 120000});
    captures.push({ name, viewport: page.viewportSize(), text: await panel.innerText(), check_ids: ["AC-REPORT-ENTRY", "AC-UI"] });
    await page.reload(wait); await expect(panel.getByRole("alert")).toContainText("请先扫码绑定这个账号，再同步数据。", wait); expect(await read()).toEqual(before);
    observations.push({ accountId: account.id, platform: account.platform, externalAccountId: account.externalAccountId, before, after: await read(), refusal: { httpStatus: response.status(), code: failure.error.code }, refresh: true, repeat: true, back: true });
  }
  expect(bindingStarts).toBe(0);
  writeFileSync(resolve(output, "public-read-observation.json"), JSON.stringify({ surface: "browser", mode: "non-fixture", witnesses: { groupId: group.id, accountIds: accounts.map(account => account.id) }, domainResponsesReplaced: false, manualAccountsIdentityVerified: false, realWechatCalled: false, bindingStarts, observations, captures }, null, 2) + "\n");
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 25200000 });
