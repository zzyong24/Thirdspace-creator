import type { Page } from "@playwright/test";

import { expect, test } from "../../helpers/test-environment";

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";
const THEME_STORAGE_KEY = "creatoros.settings.theme";

async function createAccount(page: Page): Promise<string> {
  const response = await page.request.post("/api/v1/dispatch", {
    data: {
      id: "accounts.create",
      input: {
        params: undefined,
        query: undefined,
        body: {
          platform: "douyin",
          accountHandle: "@t520-visual",
          followerBaseline: 0,
        },
      },
    },
  });
  expect(response.ok(), `accounts.create: ${response.status()}`).toBe(true);
  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

async function openDarkRadar(page: Page, accountId: string): Promise<void> {
  await page.context().addCookies([
    {
      name: CURRENT_ACCOUNT_COOKIE,
      value: encodeURIComponent(accountId),
      url: "http://127.0.0.1",
    },
  ]);
  await page.addInitScript(
    ([accountKey, themeKey, id]) => {
      window.localStorage.setItem(accountKey!, id!);
      window.localStorage.setItem(themeKey!, "dark");
    },
    [CURRENT_ACCOUNT_KEY, THEME_STORAGE_KEY, accountId],
  );
  await page.goto("/intelligence");
  await expect(page.getByTestId("intelligence-workbench")).toBeVisible();
}

test.describe("T-520 内容雷达暗色与响应式结构", () => {
  test("窄桌面双栏、宽桌面三栏，暗色侧栏取主题 token", async ({
    page,
  }) => {
    const accountId = await createAccount(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await openDarkRadar(page, accountId);

    const layout = page.getByTestId("intelligence-responsive-layout");
    const narrowTracks = await layout.evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns
          .split(" ")
          .filter(Boolean).length,
    );
    expect(narrowTracks).toBe(2);

    const sidebar = page.getByTestId("intelligence-sidebar");
    const colors = await sidebar.evaluate((element) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = "var(--creatoros-surface-subtle)";
      document.body.append(probe);
      const token = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        actual: getComputedStyle(element).backgroundColor,
        token,
        dark: document.documentElement.classList.contains("dark"),
      };
    });
    expect(colors.dark).toBe(true);
    expect(colors.actual).toBe(colors.token);

    await page.setViewportSize({ width: 1728, height: 1000 });
    const wideTracks = await layout.evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns
          .split(" ")
          .filter(Boolean).length,
    );
    expect(wideTracks).toBe(3);
  });

  test("来源弹窗可滚动、选项换行，关键操作不依赖 hover", async ({
    page,
  }) => {
    const accountId = await createAccount(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await openDarkRadar(page, accountId);

    await page.getByRole("button", { name: "添加来源" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const overflow = await dialog.evaluate(
      (element) => getComputedStyle(element).overflowY,
    );
    expect(overflow).toBe("auto");
    await expect(page.getByTestId("source-type-choices")).toBeVisible();
    await dialog.getByRole("button", { name: "我的收藏" }).click();
    await expect(
      dialog.getByRole("button", { name: "读取我的收藏夹" }),
    ).toBeVisible();
  });
});
