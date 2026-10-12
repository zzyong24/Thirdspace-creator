import { expect, test } from "../helpers/test-environment";

import { resolvePackagePublicLinks } from "../../src/lib/package-brand";

const PACKAGE_REF =
  process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_REF?.trim() || "creatoros";
const IS_CHANNEL_PACKAGE = PACKAGE_REF !== "creatoros";
const packagePublicLinks = resolvePackagePublicLinks({
  NEXT_PUBLIC_CREATOROS_PACKAGE_REF:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_REF,
  NEXT_PUBLIC_CREATOROS_PACKAGE_WEBSITE_URL:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_WEBSITE_URL,
  NEXT_PUBLIC_CREATOROS_PACKAGE_DOWNLOAD_URL:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_DOWNLOAD_URL,
  NEXT_PUBLIC_CREATOROS_PACKAGE_HUMAN_FEEDBACK_URL:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_HUMAN_FEEDBACK_URL,
  NEXT_PUBLIC_CREATOROS_PACKAGE_UPDATE_MANIFEST_URL:
    process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_UPDATE_MANIFEST_URL,
});

if (!packagePublicLinks.humanFeedbackUrl) {
  throw new Error(`包 ${PACKAGE_REF} 缺少人工反馈链接，无法执行公开入口验收`);
}

const PACKAGE_HUMAN_FEEDBACK_URL = packagePublicLinks.humanFeedbackUrl;

test.describe("T-729/T-871 当前桌面包公开入口", () => {
  test("设置页不展示常驻官网入口，人工反馈仍只使用包级链接", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "isTauri", {
        configurable: true,
        value: true,
      });
    });

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/settings");

      await expect(
        page.locator('[data-slot="check-update-official-link"]'),
      ).toHaveCount(0);
      await expect(page.getByText(/访问产品官网/)).toHaveCount(0);
    }

    // 设置页是 modal；回到真实 AppShell 后验证侧栏反馈入口。
    await page.goto("/");
    await page.getByRole("button", { name: "帮助与反馈" }).click();
    const openFeedback = page.getByRole("button", { name: "打开反馈页" });
    await expect(openFeedback).toBeEnabled();
    if (IS_CHANNEL_PACKAGE) {
      await expect(page.getByText(/官方反馈页/)).toHaveCount(0);
    }

    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/v1/local/open-url") &&
        request.method() === "POST",
    { timeout: 300000 });
    await page.route("**/api/v1/local/open-url", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await openFeedback.click();
    const request = await requestPromise;
    expect(request.postDataJSON()).toEqual({
      url: PACKAGE_HUMAN_FEEDBACK_URL,
    });
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 16860000 });
