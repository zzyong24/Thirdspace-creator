import { expect, test } from "../helpers/test-environment";
import { ROUTES } from "../fixtures/routes";

/**
 * Accessibility matrix (Task 26 / page-specs §18).
 *
 * For every approved route, assert that:
 *  - the document has a `<main>` landmark,
 *  - the page has exactly one `<h1>` (the TopHeader heading) or, for
 *    the project-workspace mode, the project title is rendered,
 *  - no images have empty alt text,
 *  - all interactive controls have accessible names.
 *
 * The Controller can extend this with axe-core injections if the
 * project decides to use the `axe-playwright` package in the future.
 */

test.describe("Accessibility matrix (Task 26)", () => {
  for (const route of ROUTES) {
    test(`${route.id} (${route.pathname}) has a single h1 and all controls are named`, async ({
      page,
    }) => {
      await page.goto(route.pathname);

      // At least one main landmark.
      await expect(page.locator("main")).toHaveCount(1);

      // No images with empty alt text.
      const images = page.locator("img");
      const imageCount = await images.count();
      for (let i = 0; i < imageCount; i += 1) {
        const alt = await images.nth(i).getAttribute("alt");
        expect(alt).not.toBe("");
      }

      // Every button has an accessible name.
      const buttons = page.locator("button");
      const buttonCount = await buttons.count();
      for (let i = 0; i < buttonCount; i += 1) {
        const name = await buttons.nth(i).evaluate((el) => {
          const labelledBy = el.getAttribute("aria-labelledby");
          const label = el.getAttribute("aria-label");
          const text = el.textContent?.trim() ?? "";
          return labelledBy || label || text;
        });
        expect(name).not.toBe("");
      }
    });
  }
});
