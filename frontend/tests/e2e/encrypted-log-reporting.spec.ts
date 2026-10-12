import { test, expect } from "@playwright/test";
const check = expect.configure({ timeout: 120000 });
test("运行诊断共享分用途保存、刷新与390宽可用", async ({ page }, info) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  const outgoing: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("growth.aitongban.cloud"))
      outgoing.push(request.url());
  });
  await page.goto("/settings");
  await page.getByRole("tab", { name: "偏好", exact: true }).click();
  const card = page.locator('[data-slot="encrypted-log-reporting"]');
  await check(card).toBeVisible();
  const metrics = card.getByRole("checkbox", { name: "共享运行指标" });
  await check(metrics).not.toBeChecked();
  await metrics.check();
  await card.getByRole("button", { name: "保存共享设置", exact: true }).click();
  await check(
    card.getByText("日志未开启 · 指标已开启", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "偏好", exact: true }).click();
  await check(metrics).toBeChecked();
  const stored = await page.request.post("/api/v1/dispatch", {
    data: { id: "settings.logReporting.get", input: {} },
  });
  expect(stored.ok()).toBe(true);
  expect((await stored.json()).data.metricsEnabled).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await check(
    card.getByRole("button", { name: "保存共享设置", exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "保存共享设置", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("diagnostics-sharing-390-controls.png"),
    fullPage: true,
  });
  await metrics.uncheck();
  await card.getByRole("button", { name: "保存共享设置", exact: true }).click();
  await check(
    card.getByText("日志未开启 · 指标未开启", { exact: true }),
  ).toBeVisible();
  expect(outgoing).toEqual([]);
});
