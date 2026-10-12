import { expect, test } from "../helpers/test-environment";

test("root route exposes the CreatorOS application container", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/CreatorOS/);

  const main = page.locator('main[data-app="creatoros"]:visible');

  await expect(main).toHaveCount(1);
  await expect(main).toHaveAttribute("data-app", "creatoros");
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 4020000 });
