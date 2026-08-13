#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromFrontend = createRequire(path.join(ROOT, "frontend/package.json"));
const { chromium } = requireFromFrontend("@playwright/test");
const samples = [
  "output/content-samples/ai-copy-eval-loop/motion-preview-v5-portrait.html",
  "output/content-samples/ai-copy-eval-loop/motion-preview-v5-landscape.html",
];
const times = [0.4, 0.8, 1.2, 1.6, 2.2, 2.8, 5.4, 5.8, 6.4, 6.8, 7.4, 7.8, 8.4, 8.8, 10.4, 10.8, 11.4, 12.2, 12.8, 13.8];

const browser = await chromium.launch({ headless: true });
const result = [];
try {
  for (const sample of samples) {
    const page = await browser.newPage();
    await page.goto(`file://${path.join(ROOT, sample)}`);
    await page.waitForTimeout(150);
    for (const time of times) {
      const collisions = await page.evaluate((t) => {
        window.__timelines.main.seek(t).pause();
        const active = (element) => {
          const clip = element.closest(".clip");
          if (!clip) return false;
          const style = getComputedStyle(clip);
          return Number(style.opacity) > 0.05 && style.visibility !== "hidden";
        };
        const rect = (element) => element.getBoundingClientRect();
        const overlap = (a, b) => {
          const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return width > 6 && height > 6 ? Math.round(width * height) : 0;
        };
        const textLayers = [...document.querySelectorAll("[data-text-safe]")].filter(active);
        const movingLayers = [...document.querySelectorAll("[data-text-avoid]")].filter(active);
        return textLayers.flatMap((textLayer) =>
          movingLayers.flatMap((movingLayer) => {
            if (textLayer.closest(".clip") !== movingLayer.closest(".clip")) return [];
            const area = overlap(rect(textLayer), rect(movingLayer));
            return area
              ? [{ text: textLayer.textContent?.trim(), moving: movingLayer.className, area }]
              : [];
          }),
        );
      }, time);
      assert.deepEqual(collisions, [], `${sample} @ ${time}s 存在文字/运动物件碰撞`);
    }
    result.push({ sample, checkedFrames: times.length });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ status: "pass", result }, null, 2));
