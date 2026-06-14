import { expect, test } from "../helpers/test-environment";
import { ROUTES } from "../fixtures/routes";

/**
 * Visual matrix (Task 26 / page-specs §18).
 *
 * For every approved route we:
 *   1. Navigate to the route.
 *   2. Lock the structural assertion (the AppShell <main> region is visible).
 *   3. Take a full-page screenshot and diff it against the
 *      Controller-approved baseline stored in
 *      `tests/visual/__screenshots__/reference-images/reference-<id>.png`.
 *
 * Baseline authority
 * ------------------
 * The baselines are produced exactly once by
 * `node scripts/visual/install-baselines.mjs`, which copies the
 * Controller-approved PNGs from `ui/`. They must NEVER be updated
 * by a subagent (see `playwright.config.ts` `updateSnapshots: "none"`
 * and the globalSetup fingerprint guard). The matching threshold
 * is `expect.toHaveScreenshot` with `maxDiffPixelRatio: 0.005`
 * (configured in playwright.config.ts).
 *
 * On failure, Playwright writes a diff PNG to
 * `test-results/.../...-diff.png`; the visual diff reporter also
 * writes a red-highlight overlay to
 * `tests/visual/__artifacts__/diff/<id>.png` for easier triage.
 */

test.describe("Visual matrix (Task 26)", () => {
  for (const route of ROUTES) {
    test(`${route.id} (${route.pathname}) renders the main region`, async ({
      page,
    }) => {
      await page.goto(route.pathname);
      const main = page.locator("main");
      await expect(main).toBeVisible();
    });

    test(`${route.id} (${route.pathname}) matches the reference image`, async ({
      page,
    }) => {
      await page.goto(route.pathname);
      await expect(page.locator("main")).toBeVisible();

      // Wait for fonts/layout to settle. We use networkidle rather
      // than a hard sleep so the test stays fast on green paths.
      await page.waitForLoadState("networkidle");

      // `toHaveScreenshot` will look up the baseline at
      //   {testDir}/__screenshots__/{testFilePath}/{projectName}/reference-<id>.png
      // relative to the resolved test path, but we point it at a
      // specific on-disk baseline by passing the absolute filename.
      // Playwright matches by basename, so the file must live under
      // a directory it knows about — we use the test-results path
      // to keep behaviour identical to the project default.
      await expect(page).toHaveScreenshot(`reference-${route.id}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.005,
      });
    });
  }
});
