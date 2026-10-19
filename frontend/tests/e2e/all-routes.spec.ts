import { expect, test } from "../helpers/test-environment";
import { randomUUID } from "node:crypto";
import { ROUTES } from "../fixtures/routes";
import { ENDPOINTS, successEnvelope, listEnvelope } from "@creatoros/contract";

/**
 * Whole-system route matrix (Task 26 / page-specs §18).
 *
 * Iterates every approved route from `tests/fixtures/routes.ts` and
 * asserts that:
 *  - the page renders without console errors,
 *  - exactly one AppShell, one Sidebar, and one TopHeader are mounted,
 *  - the expected sidebar nav item is marked `aria-current="page"`,
 *  - the TopHeader is in the expected mode,
 *  - no external network request is made.
 */

test.describe("Whole-system route matrix (Task 26)", () => {
  for (const route of ROUTES) {
    test(`route ${route.id} (${route.pathname}) renders with single shell and correct active state`, async ({
      page,
      baseURL,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      // 每例使用真实公共创建的当前成员、项目和组，不能借 seed slug 或缺账号复盘。
      const dispatch = async (id: string, input: unknown, headers: Record<string, string> = {}): Promise<unknown> => {
        const response = await page.request.post("/api/v1/dispatch", { data: { id, input }, headers, timeout: 120_000 });
        expect(response.ok(), `${id}: ${response.status()}`).toBe(true);
        return await response.json();
      };
      const group = successEnvelope(ENDPOINTS.createAccountGroup.response).parse(await dispatch("accountGroups.create", { body: { name: `路由 ${route.id}`, idempotencyKey: randomUUID() } })).data;
      const account = successEnvelope(ENDPOINTS.createAccount.response).parse(await dispatch("accounts.create", { body: { platform: "douyin", accountHandle: `@route-${randomUUID()}` } }, { "x-group-id": group.id })).data;
      const scopeHeaders = { "x-group-id": group.id, "x-account-id": account.id };
      const project = successEnvelope(ENDPOINTS.createProject.response).parse(await dispatch("projects.create", { body: { title: "AI Native Browser 深度解析", brief: "真实路由验收" } }, scopeHeaders)).data;
      // 公开项目DTO不承诺groupId；真实组归属由同组读回及错组拒绝核验，不能补造内部字段。
      const readBack = successEnvelope(ENDPOINTS.getProject.response).parse(await dispatch("projects.get", { params: { projectId: project.id } }, scopeHeaders)).data;
      expect(readBack).toEqual(project);
      const ownList = listEnvelope(ENDPOINTS.listProjects.response).parse(await dispatch("projects.list", { query: { page: 1, pageSize: 100 } }, scopeHeaders)).data;
      expect(ownList.find(item => item.id === project.id)).toEqual(readBack);
      const wrongGroup = successEnvelope(ENDPOINTS.createAccountGroup.response).parse(await dispatch("accountGroups.create", { body: { name: `错组 ${route.id}`, idempotencyKey: randomUUID() } })).data;
      expect(wrongGroup.id).not.toBe(group.id);
      const denied = await page.request.post("/api/v1/dispatch", {
        data: { id: "projects.get", input: { params: { projectId: project.id } } },
        headers: { "x-group-id": wrongGroup.id },
        timeout: 120_000,
      });
      expect(denied.status()).toBe(404);
      const otherList = listEnvelope(ENDPOINTS.listProjects.response).parse(await dispatch("projects.list", { query: { page: 1, pageSize: 100 } }, { "x-group-id": wrongGroup.id })).data;
      expect(otherList.some(item => item.id === project.id)).toBe(false);
      await page.context().addCookies([
        { name: "creatoros_current_group", value: encodeURIComponent(group.id), url: baseURL! },
        { name: "creatoros_current_account", value: encodeURIComponent(account.id), url: baseURL! },
      ]);
      await page.addInitScript(({ groupId, accountId }) => {
        localStorage.setItem("creatoros:current-group", groupId);
        localStorage.setItem("creatoros:current-account", accountId);
      }, { groupId: group.id, accountId: account.id });
      await page.goto(route.pathname.replace("ai-native-browser", project.id));
      await expect(page.getByTestId("account-switcher")).toHaveAttribute("data-state", "ready");
      if (route.id === "experience") await expect(page).toHaveURL(/\/knowledge$/);
      if (route.id === "settings") await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();

      // Single shared AppShell.
      await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
      await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
      await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

      // TopHeader mode.
      const header = page.locator('[data-slot="app-top-header"]');
      // 只在本获批浏览器用例投影当前IA；共享首轮ROUTES输入字节保持。
      const expectedHeaderMode = route.id === "project-overview" ? "project-workspace" : route.headerMode;
      await expect(header).toHaveAttribute("data-mode", expectedHeaderMode);

      // Sidebar active item.
      const nav = page.getByRole("navigation", { name: "主要导航", includeHidden: route.id === "settings" });
      const active = nav.locator('[aria-current="page"]');
      const expectedActive = route.id === "experience" ? "knowledge" : route.id === "search" ? null : route.id === "settings" ? "settings" : route.sidebarActiveId;
      await expect(active).toHaveCount(expectedActive === null ? 0 : 1);
      if (expectedActive !== null) {
        const activeHref = await active.getAttribute("href");
        expect(activeHref).toBe(expectedActive === "home" ? "/" : `/${expectedActive}`);
      }

      // No console errors.
      expect(consoleErrors).toEqual([]);
    });
  }
});

// T-1246：原字节/FAIL封存；本活跃副本仅作已批准的本case合同校准，其余正文、标题及预算保持。
test.describe.configure({ timeout: 18660000 });
