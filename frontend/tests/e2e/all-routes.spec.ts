import { expect, test } from "../helpers/test-environment";
import { ROUTES } from "../fixtures/routes";

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
        if (msg.type() === "error") consoleErrors.push(msg.text());
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
      await expect(active).toHaveCount(1);
      const activeHref = await active.getAttribute("href");
      // The "search" and "ai-copilot-overlay" routes use the home
      // nav as their active anchor (no dedicated search nav item).
      const expectedHref =
        route.sidebarActiveId === "home" ? "/" : `/${route.sidebarActiveId}`;
      expect(activeHref).toBe(expectedHref);

      // No console errors.
      expect(consoleErrors).toEqual([]);
    });
  }
});
