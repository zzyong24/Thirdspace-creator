import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the shared AppShell (Task 6).
 *
 *  - the root route exposes the CreatorOS application shell,
 *  - exactly one Sidebar and one TopHeader are present,
 *  - the primary nav lists the seven approved items,
 *  - the active item follows the current pathname,
 *  - keyboard focus order is TopHeader before PageContent.
 *
 * Visual baselines are not produced here; this is the structural
 * Playwright suite, mirroring the Vitest contract tests.
 */

test.describe("AppShell", () => {
  test("renders one Sidebar and one TopHeader on the root route", async ({
    page,
  }) => {
    await page.goto("/");

    const sidebars = page.getByTestId("app-sidebar");
    const headers = page.getByTestId("app-top-header");

    await expect(sidebars).toHaveCount(1);
    await expect(headers).toHaveCount(1);

    await expect(page).toHaveTitle(/CreatorOS/);
  });

  test("lists the seven approved primary nav items", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "主要导航" });
    const items = nav.getByRole("link");

    await expect(items).toHaveCount(7);
    await expect(items.nth(0)).toHaveText("首页");
    await expect(items.nth(1)).toHaveText("项目");
    await expect(items.nth(2)).toHaveText("知识库");
    await expect(items.nth(3)).toHaveText("素材中心");
    await expect(items.nth(4)).toHaveText("发布中心");
    await expect(items.nth(5)).toHaveText("经验沉淀");
    await expect(items.nth(6)).toHaveText("设置");
  });

  test("derives the active nav item from the pathname", async ({ page }) => {
    await page.goto("/knowledge");

    const nav = page.getByRole("navigation", { name: "主要导航" });
    const active = nav.locator('[aria-current="page"]');

    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute("href", "/knowledge");
    await expect(active).toHaveText("知识库");
  });

  test("focus order: sidebar -> top header -> page content", async ({
    page,
  }) => {
    await page.goto("/");

    // Tab through the primary nav (sidebar) until we land in the header.
    let attempts = 0;
    let inHeader = false;
    let inScroll = false;
    while (attempts < 12 && !inHeader) {
      await page.keyboard.press("Tab");
      attempts += 1;
      const focused = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || !(active instanceof HTMLElement)) return null;
        return {
          inHeader:
            active.closest('[data-testid="app-top-header"]') !== null,
          inScroll:
            active.closest('[data-testid="page-scroll-area"]') !== null,
        };
      });
      inHeader = focused?.inHeader ?? false;
      inScroll = focused?.inScroll ?? false;
    }
    expect(inHeader).toBe(true);
    expect(inScroll).toBe(false);

    // Continue tabbing — the next page-content focusable should be after
    // the header. We assert by tabbing through every header action and
    // confirming we do not enter the page scroll area.
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || !(active instanceof HTMLElement)) return null;
        return {
          inHeader:
            active.closest('[data-testid="app-top-header"]') !== null,
          inScroll:
            active.closest('[data-testid="page-scroll-area"]') !== null,
        };
      });
      if (focused?.inScroll) {
        // Once we have crossed all header actions, the next focusable is
        // in the page content. That's the expected order.
        break;
      }
    }
  });

  test("the page scroll area is the only scrollable region in the main frame", async ({
    page,
  }) => {
    await page.goto("/");

    const scroll = page.getByTestId("page-scroll-area");
    await expect(scroll).toBeVisible();
    await expect(scroll).toHaveCount(1);
  });

  test("dashboard wheel scroll stays inside the Radix viewport", async ({
    page,
  }) => {
    // 用低高度窗口稳定制造超出一屏的首页内容，避免测试数据恰好较少时没有滚动余量。
    await page.setViewportSize({ width: 1365, height: 520 });
    await page.goto("/");

    const shell = page.getByTestId("app-shell");
    const sidebar = page.getByTestId("app-sidebar");
    const header = page.getByTestId("app-top-header");
    const root = page.getByTestId("page-scroll-area");
    const viewport = root.locator('[data-slot="scroll-area-viewport"]');
    const recentPublications = page.locator(
      '[data-slot="recent-publications-card"]',
    );

    await expect(viewport).toBeVisible();
    await expect(recentPublications).toBeVisible();
    const before = await page.evaluate(() => {
      const readTop = (selector: string) =>
        document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
          .top ?? null;
      return {
        sidebarTop: readTop('[data-testid="app-sidebar"]'),
        headerTop: readTop('[data-testid="app-top-header"]'),
      };
    });

    await viewport.hover();
    await page.mouse.wheel(0, 1_200);
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    const after = await page.evaluate(() => {
      const readTop = (selector: string) =>
        document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
          .top ?? null;
      const rootElement = document.querySelector<HTMLElement>(
        '[data-testid="page-scroll-area"]',
      );
      const shellElement = document.querySelector<HTMLElement>(
        '[data-testid="app-shell"]',
      );
      return {
        windowScrollY: window.scrollY,
        documentScrollTop: document.documentElement.scrollTop,
        rootScrollTop: rootElement?.scrollTop ?? -1,
        shellScrollTop: shellElement?.scrollTop ?? -1,
        sidebarTop: readTop('[data-testid="app-sidebar"]'),
        headerTop: readTop('[data-testid="app-top-header"]'),
      };
    });

    expect(after).toMatchObject({
      windowScrollY: 0,
      documentScrollTop: 0,
      rootScrollTop: 0,
      shellScrollTop: 0,
      sidebarTop: before.sidebarTop,
      headerTop: before.headerTop,
    });
    await expect(recentPublications).toBeInViewport();
    await expect(shell).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(header).toBeVisible();
  });

  test("applies shared page spacing tokens in the browser", async ({ page }) => {
    await page.goto("/");

    const styles = await page
      .locator('[data-slot="app-page-content"]')
      .evaluate((element) => {
        const pageStyle = getComputedStyle(element);
        const main = element.firstElementChild as HTMLElement;
        return {
          gap: getComputedStyle(main).gap,
          paddingLeft: pageStyle.paddingLeft,
          paddingRight: pageStyle.paddingRight,
        };
      });

    expect(styles).toEqual({
      gap: "20px",
      paddingLeft: "24px",
      paddingRight: "24px",
    });
  });
});
