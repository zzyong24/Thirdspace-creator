#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceTalkingHead = process.argv[2];
const architectureImage = process.argv[3];
if (!sourceTalkingHead || !architectureImage) {
  throw new Error("用法: node verify-t823-main-visual-preview.mjs <talking-head-video> <architecture-image>");
}

const requireFromFrontend = createRequire(path.join(ROOT, "frontend/package.json"));
const { chromium } = requireFromFrontend("@playwright/test");
const tempRoot = mkdtempSync(path.join(tmpdir(), "creatoros-t823-preview."));
const talkingHead = path.join(tempRoot, "talking-head.mp4");
const htmlFile = path.join(tempRoot, "preview.html");
execFileSync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", "0", "-t", "12",
    "-i", sourceTalkingHead, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", talkingHead,
  ],
  { cwd: ROOT },
);
execFileSync(
  path.join(ROOT, "backend/node_modules/.bin/tsx"),
  [path.join(ROOT, "backend/scripts/t823-main-visual-preview.ts"), htmlFile, talkingHead, architectureImage],
  { cwd: ROOT, stdio: "pipe" },
);

const browser = await chromium.launch({ headless: true });
const frames = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`file://${htmlFile}`);
  await page.waitForTimeout(500);
  for (const time of [2, 8]) {
    const observed = await page.evaluate((seekTime) => {
      window.__timelines.main.seek(seekTime).pause();
      for (const clip of document.querySelectorAll(".clip")) {
        const start = Number(clip.getAttribute("data-start") ?? 0);
        const duration = Number(clip.getAttribute("data-duration") ?? 0);
        const inWindow = seekTime >= start && seekTime < start + duration;
        clip.style.setProperty("visibility", inWindow ? "visible" : "hidden", "important");
      }
      const active = (element) => {
        const style = getComputedStyle(element);
        return Number(style.opacity) > 0.05 && style.visibility !== "hidden";
      };
      const rect = (selector) => {
        const element = [...document.querySelectorAll(selector)].find(active);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
      };
      return {
        annotation: rect(".main-visual-annotation"),
        mainImage: rect('img[alt="Harness 四层架构图"]'),
        speaker: rect("#th"),
        caption: rect('[id^="cap"]'),
        largeCardCount: [...document.querySelectorAll('div.clip[id^="c"]:not([id^="cap"])')].filter(active).length,
      };
    }, time);
    assert.ok(
      observed.annotation && observed.mainImage && observed.speaker && observed.caption,
      `${time}s: 缺少活动图层 ${JSON.stringify(observed)}`,
    );
    assert.equal(observed.largeCardCount, 0, `${time}s: 主图期间仍有大卡`);
    assert.ok(observed.annotation.bottom <= observed.mainImage.y, `${time}s: 标注压住主图`);
    assert.ok(observed.mainImage.right <= observed.speaker.x, `${time}s: 主图压住人物`);
    assert.ok(observed.mainImage.bottom <= observed.caption.y, `${time}s: 主图压住字幕`);
    const screenshot = path.join(tempRoot, `frame-${time}s.png`);
    await page.screenshot({ path: screenshot });
    frames.push({ time, screenshot, observed });
  }
  assert.deepEqual(pageErrors, [], "预览页面有运行错误");
  await page.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify({ status: "pass", root: tempRoot, frames }, null, 2));
