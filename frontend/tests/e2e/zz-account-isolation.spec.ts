import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

/**
 * [T-332 S6 / T-346] 双号切换端到端(SPEC §6.1/§11.1:切号后所有账号级数据面反映新号)。
 *
 * 文件名带 zz- 前缀是有意的:e2e project 按文件字母序执行(workers=1,共享同一
 * webServer + 隔离 PGlite),本 spec 会**创建账号**——放最后跑,避免改变前面
 * spec 的「无账号引导态」世界,污染 FE-M06 既有基线的对照。
 *
 * 真实调用路径:
 *   - 数据经 page.request → POST /api/v1/dispatch(带 x-account-id header,与浏览器
 *     RPC 同链),A/B 两号各建一条独名项目;
 *   - 当前号经 localStorage['creatoros:current-account'] + creatoros_current_account
 *     cookie 预置为 A(切换器的两条真实存储通道);
 *   - 切号走 sidebar 账号切换器 UI(dropdown item 点击 → performSwitch →
 *     localStorage/cookie 镜像 → accountsChanged 广播 → router.refresh())。
 *
 * 说明:E2E 世界绑不了真抖音号(无扫码),账号是 accounts.create 建的登记行 ——
 * 覆盖的是「切号 = 切工作区」的前端闭环;真扫码绑定/采集重拉属打包真机验收清单。
 */

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";

const TITLE_A = "E2E隔离甲号项目";
const TITLE_B = "E2E隔离乙号项目";

async function dispatch(
  page: Page,
  id: string,
  input: unknown,
  accountId?: string,
): Promise<{ id: string }> {
  const res = await page.request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      ...(accountId ? { "x-account-id": accountId } : {}),
    },
    data: { id, input },
  });
  expect(res.ok(), `${id} 应成功,实得 ${res.status()}`).toBe(true);
  const json = (await res.json()) as { data: { id: string } };
  return json.data;
}

test.describe("双号切换端到端隔离(T-332 S6)", () => {
  test("A 号只见 A 的项目;切到 B 号后只见 B 的(无残影)", async ({
    page,
    context,
    baseURL,
  }) => {
    // 1. 经 dispatch 真链建两个号 + 各自一条独名项目(建号是 user 域 op,不带号 header)。
    const accA = await dispatch(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: { platform: "douyin", accountHandle: "@e2e-iso-a" },
    });
    const accB = await dispatch(page, "accounts.create", {
      params: undefined,
      query: undefined,
      body: { platform: "douyin", accountHandle: "@e2e-iso-b" },
    });
    await dispatch(
      page,
      "projects.create",
      { params: undefined, query: undefined, body: { title: TITLE_A, brief: "" } },
      accA.id,
    );
    await dispatch(
      page,
      "projects.create",
      { params: undefined, query: undefined, body: { title: TITLE_B, brief: "" } },
      accB.id,
    );

    // 2. 预置当前号 = A(切换器的两条真实存储通道:localStorage 真值 + cookie 投影),
    //    不依赖「自动选第一个 active」——前面的 spec 可能已在共享世界里建过号。
    await context.addCookies([
      {
        name: CURRENT_ACCOUNT_COOKIE,
        value: encodeURIComponent(accA.id),
        url: baseURL ?? "http://127.0.0.1",
      },
    ]);
    await page.addInitScript(
      ([key, id]) => {
        window.localStorage.setItem(key!, id!);
      },
      [CURRENT_ACCOUNT_KEY, accA.id],
    );

    // 3. A 号视角:项目列表只见 A 的。
    await page.goto("/projects");
    await expect(page.getByText(TITLE_A)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(TITLE_B)).toHaveCount(0);

    // 4. 经切换器 UI 切到 B 号(真实交互路径,非改存储)。
    await page.getByTestId("account-switcher-trigger").click();
    const menu = page.getByTestId("account-switcher-menu");
    await expect(menu).toBeVisible();
    await menu
      .locator(`[data-testid="account-switcher-item"][data-account-id="${accB.id}"]`)
      .click();

    // 5. B 号视角:refresh 后 A 的项目消失、B 的出现 —— 交叉残影 = 验收失败(§6.4)。
    await expect(page.getByText(TITLE_B)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(TITLE_A)).toHaveCount(0);

    // 6. 存储通道确已镜像到 B(下一次 RSC/RPC 都是 B 号)。
    const stored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      CURRENT_ACCOUNT_KEY,
    );
    expect(stored).toBe(accB.id);
    const cookies = await context.cookies();
    expect(
      cookies.find((c) => c.name === CURRENT_ACCOUNT_COOKIE)?.value,
    ).toBe(encodeURIComponent(accB.id));
  });
});
