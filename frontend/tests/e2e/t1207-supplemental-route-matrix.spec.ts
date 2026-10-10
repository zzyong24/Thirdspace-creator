import { randomUUID } from "node:crypto";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "../helpers/test-environment";

type Scope = { groupId?: string };
type DispatchInput = { params?: unknown; query?: unknown; body?: unknown };
type FixtureIds = {
  groupId: string;
  accountId: string;
  projectId: string;
  articleOutputId: string;
  imageOutputId: string;
  videoOutputId: string;
  canvasId: string;
  momentsId: string;
};

const idempotencyKey = (prefix: string) => `t1207-route-${prefix}-${randomUUID()}`;
let fixture: FixtureIds;

async function dispatch<T>(
  request: APIRequestContext,
  id: string,
  input: DispatchInput,
  scope: Scope = {},
): Promise<T> {
  const response = await request.post("/api/v1/dispatch", {
    headers: {
      "content-type": "application/json",
      ...(scope.groupId ? { "x-group-id": scope.groupId } : {}),
    },
    data: { id, input },
  });
  expect(response.ok(), `${id} 应成功，实际 ${response.status()}：${await response.text()}`).toBe(true);
  return ((await response.json()) as { data: T }).data;
}

async function openGroupSession(page: Page, baseURL: string | undefined) {
  const cookieURL = baseURL ?? "http://127.0.0.1";
  await page.context().addCookies([
    { name: "creatoros_current_group", value: encodeURIComponent(fixture.groupId), url: cookieURL },
    { name: "creatoros_current_account", value: "", url: cookieURL },
  ]);
  await page.addInitScript((groupId) => {
    window.localStorage.setItem("creatoros:current-group", groupId);
    window.localStorage.removeItem("creatoros:current-account");
  }, fixture.groupId);
}

async function assertRealPage(page: Page, pathname: string, routeContent?: Locator) {
  const response = await page.goto(pathname);
  expect(response, `${pathname} 应有真实页面响应`).not.toBeNull();
  expect(response!.status(), `${pathname} 不应返回 404/5xx`).toBe(200);
  const content = routeContent ?? page.locator("main").first();
  await expect(content, `${pathname} 页面主内容应可见`).toBeVisible();
  const contentText = (await content.innerText()).trim();
  expect(contentText.length, `${pathname} 页面主内容不能是空壳`).toBeGreaterThan(0);
  expect(page.url(), `${pathname} 最终应停留在本地测试服务`).toMatch(/^http:\/\/127\.0\.0\.1:/);
}

test.describe("T-1207 补充真实页面路由矩阵", () => {
  test.beforeAll(async ({ request }) => {
    const group = await dispatch<{ id: string }>(request, "accountGroups.create", {
      body: { name: "T-1207 隔离路由验收组", idempotencyKey: idempotencyKey("group") },
    });
    const account = await dispatch<{ id: string }>(request, "accounts.create", {
      body: {
        platform: "douyin",
        accountHandle: `t1207-route-${randomUUID().slice(0, 8)}`,
        idempotencyKey: idempotencyKey("account"),
      },
    }, { groupId: group.id });
    const project = await dispatch<{ id: string }>(request, "projects.create", {
      body: { title: "T-1207 隔离路由作品", brief: "只用于页面读取截图", contentType: "video" },
    }, { groupId: group.id });
    const article = await dispatch<{ id: string }>(request, "projects.outputs.create", {
      params: { projectId: project.id },
      body: { title: "隔离文章初稿", contentType: "article", clientRequestId: idempotencyKey("article") },
    }, { groupId: group.id });
    const image = await dispatch<{ id: string }>(request, "projects.outputs.create", {
      params: { projectId: project.id },
      body: { title: "隔离图文初稿", contentType: "image", clientRequestId: idempotencyKey("image") },
    }, { groupId: group.id });
    const video = await dispatch<{ id: string }>(request, "projects.outputs.create", {
      params: { projectId: project.id },
      body: { title: "隔离视频草稿", contentType: "video", clientRequestId: idempotencyKey("video") },
    }, { groupId: group.id });
    const canvas = await dispatch<{ id: string }>(request, "canvas.create", {
      body: { title: "隔离路由画布", projectId: project.id },
    }, { groupId: group.id });
    const moments = await dispatch<{ moments: { momentsId: string } }>(request, "moments.create", {
      body: {
        projectId: project.id,
        clientRequestId: idempotencyKey("moments"),
        document: { schemaVersion: 1, text: "仅用于路由验收的朋友圈稿", imageUses: [], sourceRefs: [] },
      },
    }, { groupId: group.id });
    fixture = {
      groupId: group.id,
      accountId: account.id,
      projectId: project.id,
      articleOutputId: article.id,
      imageOutputId: image.id,
      videoOutputId: video.id,
      canvasId: canvas.id,
      momentsId: moments.moments.momentsId,
    };
  });

  test.beforeEach(async ({ page, baseURL }) => {
    await openGroupSession(page, baseURL);
  });

  const sidebarRoutes = [
    ["首页", "/"],
    ["创作者总览", "/overview"],
    ["定位中心", "/positioning"],
    ["内容雷达", "/intelligence"],
    ["选题", "/topics"],
    ["项目", "/projects"],
    ["知识库", "/knowledge"],
    ["素材中心", "/assets"],
    ["创作画布", "/canvases"],
    ["发布中心", "/publishing"],
    ["运营分析", "/daily-report"],
    ["自动化", "/automations"],
    ["设置", "/settings"],
  ] as const;

  for (const [label, pathname] of sidebarRoutes) {
    test(`侧栏入口「${label}」${pathname} 显示真实主内容`, async ({ page }) => {
      const routeContent = pathname === "/positioning"
        ? page.getByRole("heading", { name: "定位中心", exact: true })
        : pathname === "/topics"
          ? page.getByRole("heading", { name: "选题中心", exact: true })
          : pathname === "/settings"
            ? page.getByRole("dialog", { name: "设置" })
            : undefined;
      await assertRealPage(page, pathname, routeContent);
    });
  }

  test("账号管理页可以打开", async ({ page }) => {
    await assertRealPage(page, "/accounts");
  });

  test("当前账号的作品目录页可以打开", async ({ page }) => {
    await assertRealPage(page, `/accounts/works?accountId=${encodeURIComponent(fixture.accountId)}`);
  });

  test("项目快速创建路由显示真实内容", async ({ page }) => {
    await assertRealPage(page, "/projects/create");
  });

  test("发布中心日历子页可以打开", async ({ page }) => {
    await assertRealPage(page, "/calendar");
  });

  const projectStages = [
    ["主稿面", ""],
    ["选题兼容入口", "/research"],
    ["计划兼容入口", "/planning"],
    ["脚本兼容入口", "/script"],
    ["发布兼容入口", "/publishing"],
    ["复盘页", "/review"],
    ["组合创作工作台", "/work"],
    ["视频剪辑工作台", "/production"],
  ] as const;

  for (const [label, suffix] of projectStages) {
    test(`项目「${label}」路由显示真实内容或有效重定向`, async ({ page }) => {
      const base = `/projects/${encodeURIComponent(fixture.projectId)}`;
      const query = suffix === "/production" ? `?outputId=${encodeURIComponent(fixture.videoOutputId)}` : "";
      const routeContent = suffix === "/production"
        ? page.getByRole("region", { name: "视频剪辑工作台" }).first()
        : undefined;
      await assertRealPage(page, `${base}${suffix}${query}`, routeContent);
    });
  }

  test("文章工作台读取真实隔离文章作品", async ({ page }) => {
    const base = `/projects/${encodeURIComponent(fixture.projectId)}`;
    await assertRealPage(page, `${base}/article?outputId=${encodeURIComponent(fixture.articleOutputId)}`);
  });

  test("图文工作台按真实隔离作品 ID 打开", async ({ page }) => {
    const base = `/projects/${encodeURIComponent(fixture.projectId)}`;
    await assertRealPage(page, `${base}/image`);
  });

  test("图文深链按真实隔离作品 ID 打开", async ({ page }) => {
    const base = `/projects/${encodeURIComponent(fixture.projectId)}`;
    await assertRealPage(page, `${base}/outputs/${encodeURIComponent(fixture.imageOutputId)}/image`);
  });

  test("视频工作台按真实隔离作品 ID 打开", async ({ page }) => {
    const base = `/projects/${encodeURIComponent(fixture.projectId)}`;
    await assertRealPage(page, `${base}/outputs/${encodeURIComponent(fixture.videoOutputId)}/video`);
  });

  test("项目画布详情按真实隔离画布 ID 打开", async ({ page }) => {
    await assertRealPage(page, `/canvases/${encodeURIComponent(fixture.canvasId)}`);
  });

  test("朋友圈工作台按真实隔离稿件 ID 打开", async ({ page }) => {
    const base = `/projects/${encodeURIComponent(fixture.projectId)}`;
    await assertRealPage(page, `${base}/moments/${encodeURIComponent(fixture.momentsId)}`);
  });

  for (const route of ["/login", "/register", "/activate"] as const) {
    test(`旧入口「${route}」有效回到本地首页`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/$/u);
      await assertRealPage(page, "/");
    });
  }
});
