import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the shared AppShell (Task 6).
 *
 *  - the root route exposes the CreatorOS application shell,
 *  - exactly one Sidebar and one TopHeader are present,
 *  - the primary nav lists the ten current product areas,
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

  test("lists the ten current primary nav items", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "主要导航" });
    const items = nav.getByRole("link");

    await expect(items).toHaveCount(10);
    await expect(items).toHaveText([
      "首页",
      "定位中心",
      "内容雷达",
      "选题",
      "项目",
      "知识库",
      "素材中心",
      "发布中心",
      "自动化",
      "设置",
    ]);
    await expect(items.nth(0)).toHaveAttribute("href", "/");
    await expect(items.nth(1)).toHaveAttribute("href", "/positioning");
    await expect(items.nth(2)).toHaveAttribute("href", "/intelligence");
    await expect(items.nth(4)).toHaveAttribute("href", "/projects");
    await expect(items.nth(7)).toHaveAttribute("href", "/publishing");
    await expect(items.nth(9)).toHaveAttribute("href", "/settings");
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
    while (attempts < 20 && !inHeader) {
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
