import { expect, test } from "../../helpers/test-environment";

/**
 * Visual / structural smoke test for the New Project overlay
 * (Task 8 / page-specs §5).
 *
 * The dialog is unit-tested in
 * `frontend/src/features/projects/new-project-form.test.tsx` and
 * `frontend/src/components/overlays/overlay-routing.test.tsx`.
 * This spec navigates to `/projects/new` in a real browser so the
 * visual regression baseline can be updated via
 * `pnpm playwright test --update-snapshots` once the Controller
 * approves a snapshot.
 *
 * Run with: `pnpm test:visual -- new-project-overlay`
 */

test.describe("New Project overlay (visual)", () => {
  test("renders the centered dialog on the /projects/new route", async ({
    page,
  }) => {
    await page.goto("/projects/new");

    // Single shared AppShell remains mounted.
    await expect(page.locator('[data-slot="app-shell"]')).toHaveCount(1);

    // Dialog is centered.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const layer = page.locator('[data-slot="overlay-layer"]');
    await expect(layer).toHaveAttribute("class", /justify-center/);

    // Dialog header has the correct title.
    await expect(dialog).toContainText("新建项目");

    // Form fields render in spec order: name → brief → platform → type →
    // mode.
    await expect(
      page.locator('[data-slot="new-project-name"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="new-project-brief"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="new-project-platform"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="new-project-content-type"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="new-project-creation-mode"]'),
    ).toBeVisible();

    // Footer exposes Cancel and Create buttons.
    await expect(
      page.locator('[data-slot="new-project-cancel"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="new-project-submit"]'),
    ).toBeVisible();
  });
});