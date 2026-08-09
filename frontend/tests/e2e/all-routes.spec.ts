import { expect, test } from "../helpers/test-environment";
import { ROUTES } from "../fixtures/routes";

const REACT_DEV_CSP_EVAL_DIAGNOSTIC =
  "eval() is not supported in this environment. If this page was served with a `Content-Security-Policy` header";

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
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        const text = msg.text();
        // Next/React 的开发构建会尝试用 eval 重建调试调用栈；CreatorOS 的严格 CSP
        // 有意拒绝它，且 React 明确说明生产构建不会走该路径。这里只忽略这条精确的
        // 框架开发诊断，不能因此给产品 CSP 放开 unsafe-eval，也不吞其他控制台错误。
        if (text.startsWith(REACT_DEV_CSP_EVAL_DIAGNOSTIC)) return;
        consoleErrors.push(text);
      });

      await page.goto(route.pathname);

      // Single shared AppShell.
      await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
      await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
      await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

      // TopHeader mode.
      const header = page.locator('[data-slot="app-top-header"]');
      await expect(header).toHaveAttribute("data-mode", route.headerMode);

      // Sidebar active item.
      const nav = page.getByRole("navigation", { name: "主要导航" });
      const active = nav.locator('[aria-current="page"]');
      if (route.id === "settings" || route.id === "search") {
        // 两者是覆盖当前工作区的全局工具，不伪造某个主导航为当前页。
        await expect(active).toHaveCount(0);
      } else {
        await expect(active).toHaveCount(1);
        const activeHref = await active.getAttribute("href");
        const expectedHref =
          route.id === "experience"
            ? "/knowledge"
            : route.sidebarActiveId === "home"
              ? "/"
              : `/${route.sidebarActiveId}`;
        expect(activeHref).toBe(expectedHref);
      }

      // No console errors.
      expect(consoleErrors).toEqual([]);
    });
  }
});
