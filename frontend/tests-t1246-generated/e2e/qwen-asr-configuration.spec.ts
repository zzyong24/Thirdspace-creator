import { expect, test } from "../helpers/test-environment";

test.describe("Qwen 方言 ASR 设置预设", () => {
  test("选择 Qwen 后带出可直接保存的真实 provider、模型与接口", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/settings");
    await page.getByRole("tab", { name: "模型配置" }).click();

    const card = page.locator('[data-slot="multimodal-audio-card"]');
    await expect(card).toBeVisible();
    await page.locator('[data-slot="multimodal-audio-preset-trigger"]').click();
    await page
      .locator('[data-slot="multimodal-audio-preset-item-qwen-asr"]')
      .click();

    await expect(
      page.locator('[data-slot="multimodal-audio-model-input"]'),
    ).toHaveValue("qwen3-asr-flash");
    await page.locator('[data-slot="multimodal-audio-advanced-toggle"]').click();
    await expect(
      page.locator('[data-slot="multimodal-audio-provider-input"]'),
    ).toHaveValue("qwen-asr");
    await expect(
      page.locator('[data-slot="multimodal-audio-base-url-input"]'),
    ).toHaveValue("https://dashscope.aliyuncs.com/compatible-mode/v1");

    await page
      .locator('[data-slot="multimodal-audio-secret-input"]')
      .fill("e2e-placeholder-key");
    await expect(page.locator('[data-slot="multimodal-audio-save"]')).toBeEnabled();
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 5940000 });
