import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the AI Copilot dialog (Task 24).
 *
 * The dialog is unit-tested in
 * `frontend/src/features/copilot/ai-copilot-content.test.tsx`. This
 * spec navigates to `/?copilot=open` in a real browser so the visual
 * regression baseline can be updated via
 * `pnpm playwright test --update-snapshots` once the Controller
 * approves a snapshot.
 *
 * Run with: `pnpm test:visual -- ai-copilot`
 */

test.describe("AI Copilot dialog (visual)", () => {
  test("renders the centered dialog on the home route", async ({ page }) => {
    await page.goto("/?copilot=open");

    // Single shared AppShell remains mounted.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);

    // Dialog is centered.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const layer = page.locator('[data-slot="overlay-layer"]');
    await expect(layer).toHaveAttribute("class", /justify-center/);

    // Header slots present.
    await expect(dialog).toContainText("你的个人创作 Copilot");
    await expect(
      page.locator('[data-slot="ai-copilot-close"]'),
    ).toBeVisible();

    // Prompt composer.
    await expect(
      page.locator('[data-slot="prompt-composer"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="prompt-input"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="submit-button"]'),
    ).toBeVisible();

    // 4 suggested chips.
    await expect(
      page.locator('[data-slot="suggested-chip"]'),
    ).toHaveCount(4);

    // Dashboard grid: 3 cards.
    await expect(
      page.locator('[data-slot="recommended-commands"]'),
    ).toBeVisible();
    await expect(page.locator('[data-slot="recent-tasks"]')).toBeVisible();
    await expect(
      page.locator('[data-slot="continuing-tasks"]'),
    ).toBeVisible();

    // Quick entries row (3 buttons).
    await expect(page.locator('[data-slot="quick-entry"]')).toHaveCount(3);

    // Smart recommendation section.
    await expect(
      page.locator('[data-slot="smart-recommendation"]'),
    ).toBeVisible();
  });
});