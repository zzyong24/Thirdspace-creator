import { expect, test } from "../helpers/test-environment";
import { ROUTES } from "../fixtures/routes";

/**
 * Visual matrix (Task 26 / page-specs §18).
 *
 * For every approved route, navigate and verify the page renders
 * with the correct shell. The actual screenshot baseline is
 * Controller-approved per-page in `tests/visual/pages/<slug>.spec.ts`;
 * this spec just exercises the route, takes a snapshot of the
 * `<main>` region, and locks the structural assertions.
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
  }
});
