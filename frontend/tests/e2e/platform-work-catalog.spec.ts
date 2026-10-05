import { expect, test } from "../helpers/test-environment";
import type { Page } from "@playwright/test";

async function dispatch<T>(page: Page, id: string, params: unknown, accountId?: string): Promise<T> {
  const response = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json", ...(accountId ? { "x-account-id": accountId } : {}) },
    data: { id, input: params },
  });
  expect(response.ok(), `${id}: ${response.status()} ${await response.text()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

test("平台作品页按当前账号显示真实空目录和待核验能力", async ({ page, context, baseURL }) => {
  const created = await page.request.post("/api/v1/dispatch", {
    headers: { "content-type": "application/json" },
    data: {
      id: "accounts.create",
      input: { params: undefined, query: undefined,
        body: { platform: "douyin", accountHandle: "E2E作品空目录号" } },
    },
  });
  expect(created.ok()).toBe(true);
  const payload = await created.json() as { data: { id: string } };
  const accountId = payload.data.id;
  await context.addCookies([{ name: "creatoros_current_account", value: encodeURIComponent(accountId),
    url: baseURL ?? "http://127.0.0.1" }]);
  await page.addInitScript(([key, id]) => window.localStorage.setItem(key!, id!),
    ["creatoros:current-account", accountId]);

  await page.goto("/accounts");
  await expect(page.getByTestId("platform-capability-overview")).toBeVisible();
  await expect(page.locator('[data-platform="xiaohongshu"]')).toContainText("已接入");
  await expect(page.locator('[data-platform="kuaishou"]')).toContainText("已接入");
  await page.goto("/accounts/works");
  const catalog = page.getByTestId("platform-work-catalog");
  await expect(catalog).toHaveAttribute("data-account-id", accountId);
  await expect(page.getByTestId("catalog-completeness")).toContainText("尚无已核验的作品目录");
  await expect(page.getByText("当前目录没有作品。可返回账号页查看平台接入状态。")).toBeVisible();
  await expect(page.getByText("暂无粉丝总量记录。")).toBeVisible();
});

test("本地账号完成多平台目标项目与发布草稿，账号归属隔离", async ({ page, context, baseURL }) => {
  let firstProjectId: string | null = null;
  for (const [platform, title, targetPlatforms] of [
    ["douyin", "抖音视频创作链验收", ["douyin", "kuaishou"]],
    ["xiaohongshu", "小红书账号视频创作链验收", ["xiaohongshu", "wechatOfficialAccount"]],
  ] as const) {
    const account = await dispatch<{ id: string }>(page, "accounts.create", {
      params: undefined, query: undefined,
      body: { platform, accountHandle: `e2e-${platform}-${Date.now()}` },
    });
    if (firstProjectId) {
      const crossAccountRead = await page.request.post("/api/v1/dispatch", {
        headers: { "content-type": "application/json", "x-account-id": account.id },
        data: { id: "projects.get", input: {
          params: { projectId: firstProjectId }, query: undefined, body: undefined,
        } },
      });
      expect(crossAccountRead.status()).toBe(404);
    }
    const project = await dispatch<{ id: string }>(page, "projects.create", {
      params: undefined, query: undefined,
      body: { title, brief: "本地隔离环境创作流验收", contentType: "video", targetPlatforms },
    }, account.id);
    const artifact = await dispatch<{ id: string }>(page, "artifacts.create", {
      params: { projectId: project.id }, query: undefined,
      body: { title: "创作稿", artifactType: "output_script", stage: "script" },
    }, account.id);
    await dispatch(page, "artifacts.versions.create", {
      params: { artifactId: artifact.id }, query: undefined,
      body: { contentText: `${title}：真实稿件内容。`, changeSummary: "隔离环境验收" },
    }, account.id);
    const output = await dispatch<{ id: string }>(page, "projects.outputs.create", {
      params: { projectId: project.id }, query: undefined,
      body: { title: `${title}作品`, contentRole: "conversion" },
    }, account.id);
    const publication = await dispatch<{ id: string }>(page, "outputs.publications.create", {
      params: { outputId: output.id }, query: undefined,
      body: { platform, accountReference: account.id },
    }, account.id);
    const readProject = await dispatch<{ id: string; title: string; briefDetail: { targetPlatforms: string[] } }>(page, "projects.get", {
      params: { projectId: project.id }, query: undefined, body: undefined,
    }, account.id);
    expect(readProject.title).toBe(title);
    expect(readProject.briefDetail.targetPlatforms).toEqual(targetPlatforms);
    firstProjectId ??= project.id;
    const readPublications = await dispatch<{ items?: Array<{ id: string }> } | Array<{ id: string }>>(
      page, "outputs.publications.list", { params: { outputId: output.id }, query: undefined, body: undefined }, account.id,
    );
    const publications = Array.isArray(readPublications) ? readPublications : readPublications.items ?? [];
    expect(publications.some(item => item.id === publication.id)).toBe(true);

    await context.addCookies([{ name: "creatoros_current_account", value: encodeURIComponent(account.id),
      url: baseURL ?? "http://127.0.0.1" }]);
    await page.addInitScript(([key, id]) => window.localStorage.setItem(key!, id!),
      ["creatoros:current-account", account.id]);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
});

test("账号页绑定成功后可直接切换到对应的小红书与快手作品页", async ({ page }) => {
  const accounts = new Map<string, string>();
  for (const platform of ["xiaohongshu", "kuaishou"] as const) {
    const account = await dispatch<{ id: string }>(page, "accounts.create", {
      params: undefined, query: undefined,
      body: { platform, accountHandle: `页面交互验收-${platform}` },
    });
    accounts.set(platform, account.id);
  }
  // This browser test covers the navigation after a successful bind response.
  // Identity proof and catalog writes are exercised by the service integration
  // test; this stub must not be described as a real QR login.
  await page.route("**/api/v1/dispatch", async (route) => {
    const body = route.request().postDataJSON() as { id?: string; input?: { body?: { platform?: string } } };
    if (body.id !== "platforms.bind.begin") return route.continue();
    const platform = body.input?.body?.platform ?? "";
    const accountId = accounts.get(platform);
    expect(accountId).toBeTruthy();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      data: { bindAttemptId: `bind-${platform}`, platform, status: "bound", accountId,
        verifiedPlatformIdentity: `verified-${platform}`, expiresAt: "2026-10-01T00:00:00.000Z" },
      meta: { requestId: "e2e-navigation" },
    }) });
  });
  for (const platform of ["xiaohongshu", "kuaishou"] as const) {
    await page.goto("/accounts");
    await page.getByTestId(`bind-${platform}-scan`).click();
    await page.getByTestId(`view-${platform}-works`).click();
    await expect(page.getByTestId("platform-work-catalog")).toHaveAttribute("data-account-id", accounts.get(platform)!);
    await expect(page.getByTestId("catalog-completeness")).toContainText("尚无已核验的作品目录");
  }
});
