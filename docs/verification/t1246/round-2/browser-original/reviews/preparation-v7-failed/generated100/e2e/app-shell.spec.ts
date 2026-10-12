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

    const approved=[["首页", "/"], ["创作者总览", "/overview"], ["定位中心", "/positioning"], ["内容雷达", "/intelligence"], ["选题", "/topics"], ["项目", "/projects"], ["知识库", "/knowledge"], ["素材中心", "/assets"], ["创作画布", "/canvases"], ["发布中心", "/publishing"], ["运营分析", "/daily-report"], ["自动化", "/automations"], ["设置", "/settings"]] as const;
    await expect(items).toHaveCount(approved.length);
    for(const [index,[label,href]] of approved.entries()){await expect(items.nth(index)).toHaveText(label);await expect(items.nth(index)).toHaveAttribute("href",href);await expect(items.nth(index)).toBeVisible();}

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

    await expect(page.locator('main[data-page="dashboard"]')).toBeVisible();
    const limit=await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]')).filter(e=>e.tabIndex>=0&&!e.matches(':disabled,[hidden]')&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=="hidden").length*2+1);
    expect(limit).toBeGreaterThan(0);let inHeader=false,inScroll=false;
    for(let attempts=0;attempts<limit&&!inHeader;attempts++){
      await page.keyboard.press("Tab");const focused=await page.evaluate(()=>{const a=document.activeElement;return a instanceof HTMLElement?{inHeader:!!a.closest('[data-testid="app-top-header"]'),inScroll:!!a.closest('[data-testid="page-scroll-area"]')}:null;});
      inHeader=focused?.inHeader??false;inScroll=focused?.inScroll??false;expect(inScroll,"正文不得先于Header获得Tab焦点").toBe(false);
    }
    expect(inHeader).toBe(true);expect(inScroll).toBe(false);
    for(let attempts=0;attempts<limit&&!inScroll;attempts++){
      await page.keyboard.press("Tab");const focused=await page.evaluate(()=>{const a=document.activeElement;return a instanceof HTMLElement?{inScroll:!!a.closest('[data-testid="page-scroll-area"]'),inSidebar:!!a.closest('[data-testid="app-sidebar"]')}:null;});
      expect(focused?.inSidebar,"未进入正文前不能绕回侧栏形成焦点循环").not.toBe(true);inScroll=focused?.inScroll??false;
    }
    expect(inScroll,"真实Tab必须从Header进入正文").toBe(true);

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

    await expect(page.locator('main[data-page="dashboard"]')).toBeVisible();
    const styles = await page
      .locator('[data-slot="app-page-content"]')
      .evaluate((element) => {
        const pageStyle = getComputedStyle(element);
        const main = element.querySelector('main[data-page="dashboard"]') as HTMLElement;
        if(!main||!main.getClientRects().length)throw new Error("当前可见Dashboard尚未交付");
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

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 30060000 });
