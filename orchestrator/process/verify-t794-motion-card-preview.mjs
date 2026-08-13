#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireFromFrontend = createRequire(path.join(ROOT, "frontend/package.json"));
const { chromium } = requireFromFrontend("@playwright/test");
const tempRoot = mkdtempSync(path.join(tmpdir(), "creatoros-t794-preview."));
const tsx = path.join(ROOT, "backend/node_modules/.bin/tsx");
const generator = path.join(ROOT, "backend/scripts/t794-motion-card-preview.ts");
const expectedMarkers = [
  "visual-magnitude",
  "visual-contrast",
  "visual-sequence",
  "visual-cause-effect",
  "visual-replacement",
];

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const spec of [
    { name: "landscape", width: 1920, height: 1080 },
    { name: "portrait", width: 1080, height: 1920 },
  ]) {
    const htmlFile = path.join(tempRoot, `${spec.name}.html`);
    execFileSync(tsx, [generator, htmlFile, spec.name], {
      cwd: ROOT,
      stdio: "pipe",
    });
    const page = await browser.newPage({
      viewport: { width: spec.width, height: spec.height },
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`file://${htmlFile}`);
    await page.waitForTimeout(250);

    const runtime = await page.evaluate(() => ({
      hasGsap: typeof window.gsap === "object",
      duration: window.__timelines?.main?.duration?.() ?? 0,
      html: document.documentElement.outerHTML,
    }));
    assert.equal(runtime.hasGsap, true, `${spec.name}: GSAP 未加载`);
    assert.equal(runtime.duration, 15, `${spec.name}: 主时间线长度不正确`);
    assert.match(runtime.html, /stroke-dasharray=%223%207%22/, `${spec.name}: 虚线网格缺失`);

    const cards = page.locator(".visual-sentence");
    assert.equal(await cards.count(), expectedMarkers.length, `${spec.name}: 关系卡数量不正确`);
    const geometry = [];
    for (let index = 0; index < expectedMarkers.length; index += 1) {
      const observed = await page.evaluate((input) => {
        const cards = [...document.querySelectorAll(".visual-sentence")];
        for (const clip of document.querySelectorAll(".clip")) {
          clip.style.setProperty("display", "none", "important");
        }
        for (const persistentId of ["bg", "grid", "glow", "cap0", "brand", "pbar"]) {
          const persistent = document.getElementById(persistentId);
          if (persistent) persistent.style.setProperty("display", "block", "important");
        }
        const target = cards[input.index];
        const clip = target?.closest(".clip");
        if (!target || !clip) throw new Error(`找不到第 ${input.index + 1} 张视觉句子`);
        clip.style.setProperty("display", "block", "important");
        for (const element of [clip, target, ...target.querySelectorAll("*")]) {
          element.style.setProperty("opacity", "1", "important");
          element.style.setProperty("visibility", "visible", "important");
          element.style.setProperty("transform", "none", "important");
          element.style.setProperty("filter", "none", "important");
        }
        const rect = target.getBoundingClientRect();
        const caption = document.getElementById("cap0")?.getBoundingClientRect();
        return {
          className: target.className,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
          captionTop: caption?.top ?? input.height,
        };
      }, { index, height: spec.height });
      assert.match(observed.className, new RegExp(expectedMarkers[index]));
      assert.ok(observed.x >= 0 && observed.y >= 0, `${spec.name}: 视觉句子越过左/上边界`);
      assert.ok(
        observed.right <= spec.width && observed.bottom <= spec.height,
        `${spec.name}: 视觉句子越过画布边界`,
      );
      assert.ok(
        observed.bottom + 20 <= observed.captionTop,
        `${spec.name}: 视觉句子侵入字幕安全区`,
      );
      geometry.push(observed);
      await page.screenshot({
        path: path.join(tempRoot, `${spec.name}-${index + 1}.png`),
      });
    }
    assert.deepEqual(pageErrors, [], `${spec.name}: 页面运行错误`);
    results.push({ viewport: `${spec.width}x${spec.height}`, geometry });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(
  JSON.stringify({ status: "pass", screenshots: tempRoot, viewports: results }, null, 2),
);
