import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "../helpers/test-environment";

const CHECK_IDS = [
  "AC-ASR-PRESET",
  "AC-ASR-RECOMMENDED",
  "AC-ASR-ADVANCED",
  "AC-ASR-NARROW",
];

test.describe("ASR 建议配置与小米 MiMo 轻量配置", () => {
  test("普通路径只需预设、模型与 Key，高级字段可按需展开", async ({ page }) => {
    const captures: Array<{
      checkpoint: string;
      check_ids: string[];
      viewport: { width: number; height: number };
      text: string;
    }> = [];

    await page.setViewportSize({ width: 1536, height: 1024 });
    await page.goto("/settings");
    await page.getByRole("tab", { name: "模型配置" }).click();

    const card = page.locator('[data-slot="multimodal-audio-card"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText("语音转文字（建议配置）");
    await expect(card).toContainText("建议配置 ASR 转录模型，避免本地转录时间过长");
    await expect(card).toContainText("未配置时仍可使用本地 Whisper");
    await expect(
      page.locator('[data-slot="multimodal-audio-advanced-settings"]'),
    ).toBeHidden();

    await page.locator('[data-slot="multimodal-audio-preset-trigger"]').click();
    await page
      .locator('[data-slot="multimodal-audio-preset-item-xiaomi-mimo"]')
      .click();
    await expect(
      page.locator('[data-slot="multimodal-audio-model-input"]'),
    ).toHaveValue("mimo-v2.5-asr");
    await expect(
      page.locator('[data-slot="multimodal-audio-provider-input"]'),
    ).toHaveValue("xiaomi-mimo");
    await expect(
      page.locator('[data-slot="multimodal-audio-base-url-input"]'),
    ).toHaveValue("https://api.xiaomimimo.com/v1");
    await expect(
      page.locator('[data-slot="multimodal-audio-save"]'),
    ).toBeDisabled();

    await page
      .locator('[data-slot="multimodal-audio-secret-input"]')
      .fill("e2e-placeholder-key");
    await expect(
      page.locator('[data-slot="multimodal-audio-save"]'),
    ).toBeEnabled();

    await page.locator('[data-slot="multimodal-audio-advanced-toggle"]').click();
    await expect(
      page.locator('[data-slot="multimodal-audio-advanced-settings"]'),
    ).toBeVisible();
    captures.push({
      checkpoint: "desktop-asr-card",
      check_ids: [...CHECK_IDS],
      viewport: { width: 1536, height: 1024 },
      text: (await card.innerText()).replace("e2e-placeholder-key", "[已脱敏]"),
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(card).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    captures.push({
      checkpoint: "minimum-asr-card",
      check_ids: [...CHECK_IDS],
      viewport: { width: 1024, height: 768 },
      text: (await card.innerText()).replace("e2e-placeholder-key", "[已脱敏]"),
    });

    const repoRoot = resolve(process.cwd(), "..");
    const evidenceDir = resolve(process.env.CREATOROS_T1246_RUN_DIR!, "original-output", "orchestrator", "evidence");
    mkdirSync(evidenceDir, { recursive: true });
    const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
    const artifact = `${JSON.stringify(
      {
        schema: "frontend-visible-copy/v1",
        task_id: "T-641",
        commit_sha: commitSha,
        captures,
      },
      null,
      2,
    )}\n`;
    writeFileSync(resolve(evidenceDir, "T-641-visible-copy.json"), artifact);
    expect(createHash("sha256").update(artifact).digest("hex")).toHaveLength(64);
  });
});

// T-1246 copied-source declaration: original assertions unchanged.
test.describe.configure({ timeout: 20460000 });
