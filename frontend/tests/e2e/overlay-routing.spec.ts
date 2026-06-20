import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for overlay routing (Task 8).
 *
 *  - Direct visit to `/projects/new` renders the new-project overlay shell.
 *  - `?copilot=open` opens the Copilot overlay with the pathname
 *    preserved; pressing Back closes only the overlay.
 *  - Tab focus is contained inside an open overlay (focus trap).
 *
 * The click-through interception of `/projects/new` (background route
 * present) is exercised by the unit tests; the E2E layer here focuses
 * on the routing shells that do not depend on Phase 2 pages such as the
 * Projects index.
 */

test.describe("overlay routing", () => {
  test("direct visit to /projects/new renders the new-project overlay shell", async ({
    page,
  }) => {
    await page.goto("/projects/new");

    const dialog = page.getByRole("dialog", { name: /新建项目/i });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /新建项目/i }),
    ).toBeVisible();

    // The overlay owns its mask; the underlying shell stays unmasked.
    await expect(
      page.locator(
        '[data-slot="overlay-layer"][data-overlay="new-project"] [data-slot="overlay-mask"]',
      ),
    ).toBeVisible();
    const shell = page.getByTestId("app-shell");
    await expect(shell).toHaveAttribute("data-masked", "false");
  });

  test("?copilot=open on / opens the copilot overlay and preserves pathname", async ({
    page,
  }) => {
    await page.goto("/?copilot=open");

    // Wait for hydration to settle so we don't catch the Suspense
    // placeholder DOM alongside the real overlay.
    const dialog = page.getByRole("dialog", { name: /AI 助手/i });
    await expect(dialog).toBeVisible();
    await expect(page.locator('[id^="S:"]')).toHaveCount(0);

    // Pathname preserved.
    expect(new URL(page.url()).pathname).toBe("/");
    expect(new URL(page.url()).searchParams.get("copilot")).toBe("open");

    // The overlay renders its own backdrop mask above the AppShell
    // (the visual masking is handled by the controller's backdrop, not
    // by a data-masked attribute on the shell). The copilot mask is
    // scoped to the copilot overlay layer so it does not collide with
    // any other overlay that may exist on the page.
    const copilotMask = page.locator(
      '[data-slot="overlay-layer"][data-overlay="copilot"] [data-slot="overlay-mask"]',
    );
    await expect(copilotMask).toBeVisible();
  });

  test("pressing Back closes the copilot overlay before leaving the page", async ({
    page,
  }) => {
    await page.goto("/");
    await page.goto("/?copilot=open");

    const dialog = page.getByRole("dialog", { name: /AI 助手/i });
    await expect(dialog).toBeVisible();

    await page.goBack();

    // The overlay is gone but we are still on / (Back closed the
    // overlay state, not the underlying page).
    await expect(page.getByRole("dialog", { name: /AI 助手/i })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/");
    expect(new URL(page.url()).searchParams.get("copilot")).toBeNull();
  });

  test("Tab focus stays inside an open overlay", async ({ page }) => {
    await page.goto("/?copilot=open");

    const dialog = page.getByRole("dialog", { name: /AI 助手/i });
    await expect(dialog).toBeVisible();

    // Tab repeatedly; focus must stay inside the dialog and never land
    // on the underlying sidebar nav.
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press("Tab");
      const insideDialog = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || !(active instanceof HTMLElement)) return false;
        const dialog = document.querySelector('[role="dialog"][aria-label="AI 助手"]');
        if (!dialog) return false;
        return dialog.contains(active);
      });
      expect(insideDialog).toBe(true);
    }
  });
});
