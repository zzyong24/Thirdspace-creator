import { expect, test } from "../helpers/test-environment";

/**
 * E2E contract for the AI Copilot dialog (Task 24).
 *
 *  - `?copilot=open` opens the centered dialog on any page; the AppShell
 *    remains mounted with one Sidebar and one TopHeader (background is
 *    masked per D-006).
 *  - The dialog is `role="dialog"` with `aria-modal="true"`.
 *  - The close button removes only `?copilot=open` from the URL; the
 *    underlying pathname is preserved.
 *  - Escape closes the dialog.
 *  - Browser Back closes the dialog.
 *  - The submit button sends the message through the real same-origin
 *    `/api/chat` stream; the shared network policy still forbids external calls.
 */

test.describe("AI Copilot dialog", () => {
  test("opens the centered dialog from any page via ?copilot=open", async ({
    page,
  }) => {
    await page.goto("/?copilot=open");

    // Single shared AppShell.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="app-top-header"]')).toHaveCount(1);

    // Centered dialog (not right-side drawer).
    const layer = page.locator('[data-slot="overlay-layer"]');
    await expect(layer).toBeVisible();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(layer).toHaveAttribute("class", /justify-center/);
    await expect(layer).not.toHaveAttribute("class", /justify-end/);

    // Current conversation surface. The retired dashboard/quick-entry cards
    // are intentionally absent after Copilot converged on one chat flow.
    await expect(page.locator('[data-slot="prompt-composer"]')).toBeVisible();
    await expect(page.locator('[data-slot="copilot-dashboard"]')).toHaveCount(0);
    await expect(page.locator('[data-slot="quick-entries"]')).toHaveCount(0);
  });

  test("close button removes only ?copilot=open and preserves the pathname", async ({
    page,
  }) => {
    await page.goto("/projects?copilot=open");
    await page.getByTestId("ai-copilot-close").click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page).not.toHaveURL(/copilot=/);
  });

  test("Escape closes the dialog", async ({ page }) => {
    await page.goto("/?copilot=open");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/copilot=/);
  });

  test("browser Back closes the dialog", async ({ page }) => {
    await page.goto("/?copilot=open");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page).not.toHaveURL(/copilot=/);
  });

  test("submit button posts only to the same-origin chat endpoint", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (req) => {
      if (req.method() !== "GET") {
        requests.push(req.url());
      }
    });
    await page.goto("/?copilot=open");
    // The composer disables submit while empty, so type first.
    await page.getByLabel("我能帮你做什么").fill("帮我分析这个选题");
    await page.getByTestId("submit-button").click();
    // Allow microtasks to settle.
    await page.waitForTimeout(50);
    const chatRequests = requests.filter((url) => /\/api\/chat$/.test(url));
    expect(chatRequests).toHaveLength(1);
    expect(new URL(chatRequests[0]!).origin).toBe(new URL(page.url()).origin);
  });
});
