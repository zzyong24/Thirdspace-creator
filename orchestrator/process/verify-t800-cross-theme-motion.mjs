#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromFrontend = createRequire(path.join(ROOT, "frontend/package.json"));
const { chromium } = requireFromFrontend("@playwright/test");
const sampleRoot = path.join(ROOT, "output/content-samples/cross-theme-motion-eval");
const themes = ["content-creation", "personal-growth", "product-thinking"];
const orientations = [
  { name: "portrait", width: 1080, height: 1920 },
  { name: "landscape", width: 1920, height: 1080 },
];
const times = [0.4, 1.2, 2.4, 3.6, 4.4, 5.6, 6.8, 7.6, 8.4, 9.2, 10.4, 11.4];

const browser = await chromium.launch({ headless: true });
const samples = [];
const allCollisions = [];
try {
  for (const theme of themes) {
    for (const orientation of orientations) {
      const file = path.join(sampleRoot, `${theme}.${orientation.name}.html`);
      const page = await browser.newPage({
        viewport: { width: orientation.width, height: orientation.height },
      });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`file://${file}`);
      await page.waitForTimeout(180);
      const runtime = await page.evaluate(() => ({
        duration: window.__timelines?.main?.duration?.() ?? 0,
        width: Number(document.querySelector("[data-composition-id]")?.getAttribute("data-width")),
        height: Number(document.querySelector("[data-composition-id]")?.getAttribute("data-height")),
        hasGrid: document.documentElement.outerHTML.includes("stroke-dasharray=%223%207%22"),
      }));
      assert.equal(runtime.duration, 12, `${theme}/${orientation.name}: 时间线不是 12 秒`);
      assert.equal(runtime.width, orientation.width, `${theme}/${orientation.name}: 宽度错误`);
      assert.equal(runtime.height, orientation.height, `${theme}/${orientation.name}: 高度错误`);
      assert.equal(runtime.hasGrid, true, `${theme}/${orientation.name}: 虚线网格缺失`);

      const frameAudit = [];
      for (const time of times) {
        const frame = await page.evaluate((t) => {
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
          const collisions = textLayers.flatMap((textLayer) =>
            movingLayers.flatMap((movingLayer) => {
              if (textLayer.closest(".clip") !== movingLayer.closest(".clip")) return [];
              const area = overlap(rect(textLayer), rect(movingLayer));
              return area
                ? [{ text: textLayer.textContent?.trim(), moving: movingLayer.className, area }]
                : [];
            }),
          );
          const activeVisuals = [...document.querySelectorAll(".visual-sentence")].filter(active);
          return { time: t, collisions, activeVisualCount: activeVisuals.length };
        }, time);
        for (const collision of frame.collisions) {
          allCollisions.push({
            theme,
            orientation: orientation.name,
            time,
            ...collision,
          });
        }
        frameAudit.push(frame);
      }
      assert.deepEqual(pageErrors, [], `${theme}/${orientation.name}: 页面运行错误`);
      samples.push({ theme, orientation: orientation.name, frameAudit });
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      status: allCollisions.length === 0 ? "pass" : "fail",
      collisionCount: allCollisions.length,
      collisions: allCollisions,
      samples,
    },
    null,
    2,
  ),
);
