import type { Page } from "@playwright/test";
import { ENDPOINTS, ErrorCode, type AccountGroupResource } from "@creatoros/contract";
import { expect as baseExpect, test } from "../helpers/test-environment";

const expect = baseExpect.configure({ timeout: 120_000 });
/** 保留原真实账号登记/account-only 项目创建；切换按 T1022 的账号组合同。
 * zz- 仍最后执行，不污染其它用例的无账号初始状态。这里不验证平台扫码登录。
 */
const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const CURRENT_GROUP_KEY = "creatoros:current-group";
const CURRENT_GROUP_COOKIE = "creatoros_current_group";
const TITLE_A = "E2E隔离甲号项目";
const TITLE_B = "E2E隔离乙号项目";

async function dispatchEnvelope<T>(
  page: Page,
  id: string,
  input: unknown,
  accountId?: string,
  groupId?: string,
): Promise<{ data: T; meta?: { total: number } }> {
  const response = await page.request.post("/api/v1/dispatch", {
    timeout: 120_000,
    headers: {
      "content-type": "application/json",
      ...(accountId ? { "x-account-id": accountId } : {}),
      ...(groupId ? { "x-group-id": groupId } : {}),
    },
    data: { id, input },
  });
  expect(response.ok(), `${id} 应成功，实得 ${response.status()}`).toBe(true);
  return response.json();
}
async function dispatch<T = { id: string }>(
  page: Page,
  id: string,
  input: unknown,
  accountId?: string,
  groupId?: string,
): Promise<T> {
  return (await dispatchEnvelope<T>(page, id, input, accountId, groupId)).data;
}
async function listGroups(page: Page): Promise<AccountGroupResource[]> {
  const groups: AccountGroupResource[] = [];
  for (let pageNumber = 1; ; pageNumber += 1) {
    const result = await dispatchEnvelope<AccountGroupResource[]>(
      page, "accountGroups.list", { query: { page: pageNumber, pageSize: 100 } },
    );
    expect(Number.isInteger(result.meta?.total)).toBe(true);
    const total = result.meta!.total;
    groups.push(...result.data);
    expect(groups.length).toBeLessThanOrEqual(total);
    if (groups.length === total) return groups;
    // 错分页不能靠循环猜组；实际 meta 必须完整且每页前进。
    expect(result.data.length).toBeGreaterThan(0);
  }
}

async function expectGroupMirrors(page: Page, groupId: string) {
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), CURRENT_GROUP_KEY), { timeout: 300000 }).toBe(groupId);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), CURRENT_ACCOUNT_KEY), { timeout: 300000 }).toBeNull();
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === CURRENT_GROUP_COOKIE)?.value).toBe(encodeURIComponent(groupId));
  expect(cookies.find((cookie) => cookie.name === CURRENT_ACCOUNT_COOKIE)).toBeUndefined();
}
async function switchGroup(page: Page, groupId: string) {
  await page.getByTestId("account-switcher-trigger").click();
  const menu = page.getByTestId("account-switcher-menu");
  await expect(menu).toBeVisible();
  const item = menu.locator(`[data-testid="account-switcher-item"][data-group-id="${groupId}"]`);
  await expect(item).toHaveCount(1);
  await item.click();
}

test.describe("双号切换端到端隔离(T-332 S6)", () => {
  test("A 号只见 A 的项目;切到 B 号后只见 B 的(无残影)", async ({ page, context, baseURL }, info) => {
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(120_000);
    const accA = await dispatch(page, "accounts.create", {
      body: { platform: "douyin", accountHandle: "@e2e-iso-a" },
    });
    const accB = await dispatch(page, "accounts.create", {
      body: { platform: "douyin", accountHandle: "@e2e-iso-b" },
    });
    const projectA = await dispatch(page, "projects.create", {
      body: { title: TITLE_A, brief: "" },
    }, accA.id);
    const projectB = await dispatch(page, "projects.create", {
      body: { title: TITLE_B, brief: "" },
    }, accB.id);
    const groups = await listGroups(page);
    const groupFor = (accountId: string) => {
      const matches = groups.filter((group) => group.members.some((member) => member.accountId === accountId && member.leftAt === null));
      expect(matches).toHaveLength(1);
      return matches[0]!;
    };
    const groupA = groupFor(accA.id), groupB = groupFor(accB.id);
    expect(groupA.id).not.toBe(groupB.id);

    // 首访仍只种原 legacy A，让应用经真实 members 初始化组选入。
    await context.addCookies([{ name: CURRENT_ACCOUNT_COOKIE, value: encodeURIComponent(accA.id), url: baseURL! }]);
    await page.addInitScript(({ accountKey, groupKey, accountId }) => {
      if (!localStorage.getItem(groupKey)) localStorage.setItem(accountKey, accountId);
    }, { accountKey: CURRENT_ACCOUNT_KEY, groupKey: CURRENT_GROUP_KEY, accountId: accA.id });
    await page.goto("/projects");
    await expect(page.getByText(TITLE_A, { exact: true })).toBeVisible();
    await expect(page.getByText(TITLE_B, { exact: true })).toHaveCount(0);
    await expectGroupMirrors(page, groupA.id);
    await page.screenshot({ path: info.outputPath("group-a-initial.png"), fullPage: true , timeout: 120000});

    await switchGroup(page, groupB.id);
    await expect(page.getByText(TITLE_B, { exact: true })).toBeVisible();
    await expect(page.getByText(TITLE_A, { exact: true })).toHaveCount(0);
    await expectGroupMirrors(page, groupB.id);
    await page.screenshot({ path: info.outputPath("group-b-after-switch.png"), fullPage: true , timeout: 120000});

    await switchGroup(page, groupA.id);
    await expect(page.getByText(TITLE_A, { exact: true })).toBeVisible();
    await expect(page.getByText(TITLE_B, { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(TITLE_A, { exact: true })).toBeVisible();
    await expect(page.getByText(TITLE_B, { exact: true })).toHaveCount(0);
    await expectGroupMirrors(page, groupA.id);
    await page.screenshot({ path: info.outputPath("group-a-return-reload.png"), fullPage: true , timeout: 120000});

    const readA = ENDPOINTS.getProject.response.parse(await dispatch<unknown>(page, "projects.get", { params: { projectId: projectA.id } }, undefined, groupA.id));
    const readB = ENDPOINTS.getProject.response.parse(await dispatch<unknown>(page, "projects.get", { params: { projectId: projectB.id } }, undefined, groupB.id));
    expect(readA).toMatchObject({ id: projectA.id, title: TITLE_A });
    expect(readB).toMatchObject({ id: projectB.id, title: TITLE_B });
    const rejected = [];
    for (const [projectId, wrongGroupId] of [[projectA.id, groupB.id], [projectB.id, groupA.id]]) {
      const response = await page.request.post("/api/v1/dispatch", {
        timeout: 120_000,
        headers: { "x-group-id": wrongGroupId! },
        data: { id: "projects.get", input: { params: { projectId } } },
      });
      expect(response.status()).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe(ErrorCode.OwnershipError);
      rejected.push({ projectId, wrongGroupId, status: response.status(), code: body.error.code });
    }
    await info.attach("真实双组项目回读", { body: JSON.stringify({ accountA: accA.id, accountB: accB.id, groupA: groupA.id, groupB: groupB.id, readA, readB, rejected }), contentType: "application/json" });
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 39060000 });
