import { expect, test } from "../helpers/test-environment";

test("root route exposes the CreatorOS application container", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/CreatorOS/);

  const main = page.locator("main");

  await expect(main).toHaveCount(1);
  await expect(main).toHaveAttribute("data-app", "creatoros");
});
