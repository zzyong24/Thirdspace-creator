import { expect, test as base, type Page } from "@playwright/test";
import {
  type ExternalNetworkAttempt,
  formatExternalNetworkAttempts,
  recordExternalNetworkAttempt,
} from "./network-policy";

type AccountFixtureOptions = {
  accountMode: "selected" | "unselected";
};

const CURRENT_ACCOUNT_KEY = "creatoros:current-account";
const CURRENT_ACCOUNT_COOKIE = "creatoros_current_account";

async function dispatch(
  page: Page,
  id: string,
  input: unknown,
) {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json" },
    data: { id, input },
  });
  if (!response.ok()) {
    throw new Error(
      `${id} 测试夹具请求失败：${response.status()} ${await response.text()}`,
    );
  }
  return (await response.json()) as { data: unknown };
}

export const test = base.extend<AccountFixtureOptions>({
  accountMode: ["selected", { option: true }],
  context: async ({ context }, provide) => {
    const externalNetworkAttempts: ExternalNetworkAttempt[] = [];

    await context.route("**/*", async (route) => {
      const url = route.request().url();

      if (
        recordExternalNetworkAttempt(externalNetworkAttempts, "http", url)
      ) {
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    });

    await context.routeWebSocket("**/*", async (webSocket) => {
      const url = webSocket.url();

      if (
        recordExternalNetworkAttempt(
          externalNetworkAttempts,
          "websocket",
          url,
        )
      ) {
        await webSocket.close({
          code: 1008,
          reason: "External network requests are disabled in browser tests.",
        });
        return;
      }

      webSocket.connectToServer();
    });

    await provide(context);

    if (externalNetworkAttempts.length > 0) {
      throw new Error(
        formatExternalNetworkAttempts(externalNetworkAttempts),
      );
    }
  },
  page: async ({ accountMode, baseURL, context, page }, provide, testInfo) => {
    if (accountMode === "unselected") {
      // “未选择”是浏览器会话状态，不等于要删除/归档共享测试库里的账号。
      // 并发 E2E 若在这里归档账号，会让其他 worker 已选中的账号在运行中失效。
      await context.clearCookies({ name: CURRENT_ACCOUNT_COOKIE });
      await page.addInitScript(
        (key) => window.localStorage.removeItem(key),
        CURRENT_ACCOUNT_KEY,
      );
    } else {
      const suffix = `${testInfo.workerIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const created = await dispatch(page, "accounts.create", {
        params: undefined,
        query: undefined,
        body: {
          platform: "douyin",
          accountHandle: `@e2e-${suffix}`,
        },
      });
      const account = created.data as { id: string };
      await context.addCookies([
        {
          name: CURRENT_ACCOUNT_COOKIE,
          value: encodeURIComponent(account.id),
          url: baseURL ?? "http://127.0.0.1",
        },
      ]);
      await page.addInitScript(
        ([key, id]) => window.localStorage.setItem(key, id),
        [CURRENT_ACCOUNT_KEY, account.id],
      );
    }

    await provide(page);
  },
});

export { expect };
