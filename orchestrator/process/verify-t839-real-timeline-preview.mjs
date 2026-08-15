#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [taskRecord, databasePath, mediaRoot, sourceTalkingHead, outputDir] = process.argv.slice(2);
if (!taskRecord || !databasePath || !mediaRoot || !sourceTalkingHead || !outputDir) {
  throw new Error(
    "用法: node verify-t839-real-timeline-preview.mjs <task-record.json> <pglite-db> <media-root> <talking-head-video> <output-dir>",
  );
}

const requireFromFrontend = createRequire(path.join(ROOT, "frontend/package.json"));
const { chromium } = requireFromFrontend("@playwright/test");
const tempRoot = mkdtempSync(path.join(tmpdir(), "creatoros-t839-preview."));
const htmlFile = path.join(tempRoot, "preview.html");
const talkingHeadPreview = path.join(tempRoot, "talking-head.mp4");
const evidenceDir = path.resolve(outputDir);
mkdirSync(evidenceDir, { recursive: true });

// Chromium 不保证解码手机 MOV/HEVC；预览只转封装编码，不改画面内容。
execFileSync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-y", "-t", "90",
    "-i", sourceTalkingHead, "-an", "-c:v", "libx264", "-preset", "veryfast",
    "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", talkingHeadPreview,
  ],
  { cwd: ROOT, stdio: "pipe" },
);

execFileSync(
  path.join(ROOT, "backend/node_modules/.bin/tsx"),
  [
    path.join(ROOT, "backend/scripts/t839-real-timeline-preview.ts"),
    taskRecord,
    databasePath,
    mediaRoot,
    htmlFile,
    talkingHeadPreview,
  ],
  { cwd: ROOT, stdio: "pipe" },
);

const checkpoints = [
  { time: 1.5, expected: "ambient" },
  { time: 25.6, expected: "card" },
  { time: 30, expected: "card" },
  { time: 35, expected: "card" },
  { time: 85, expected: "ambient" },
  { time: 86.5, expected: "main-visual" },
];
const browser = await chromium.launch({ headless: true });
const frames = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`file://${htmlFile}`);
  await page.waitForTimeout(1_000);

  for (const checkpoint of checkpoints) {
    const observed = await page.evaluate(async (seekTime) => {
      window.__timelines.main.seek(seekTime).pause();
      await Promise.all(
        [...document.querySelectorAll("video")].map(
          (video) =>
            new Promise((resolveSeek) => {
              const start = Number(video.getAttribute("data-start") ?? 0);
              const seek = () => {
                const target = Math.max(0, seekTime - start);
                if (Math.abs(video.currentTime - target) < 0.03) {
                  video.pause();
                  resolveSeek();
                  return;
                }
                const done = () => {
                  video.pause();
                  resolveSeek();
                };
                video.addEventListener("seeked", done, { once: true });
                video.currentTime = Math.min(target, Number.isFinite(video.duration) ? video.duration : target);
                setTimeout(done, 1_500);
              };
              if (video.readyState >= 1) seek();
              else video.addEventListener("loadedmetadata", seek, { once: true });
            }),
        ),
      );
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
      return {
        ambient: Boolean(document.querySelector("#thAmbient") && active(document.querySelector("#thAmbient"))),
        cards: [...document.querySelectorAll('div.clip[id^="c"]:not([id^="cap"])')].filter(active).length,
        mainVisuals: [...document.querySelectorAll('img.clip[id^="br"], video.clip[id^="br"]')].filter(active).length,
      };
    }, checkpoint.time);

    if (checkpoint.expected === "ambient") assert.equal(observed.ambient, true);
    if (checkpoint.expected === "card") assert.ok(observed.cards > 0, `${checkpoint.time}s 未恢复信息卡`);
    if (checkpoint.expected === "main-visual") {
      assert.ok(observed.mainVisuals > 0, `${checkpoint.time}s 真实主素材未显示`);
    }
    const screenshot = path.join(evidenceDir, `frame-${checkpoint.time.toFixed(1)}s.jpg`);
    await page.screenshot({ path: screenshot, type: "jpeg", quality: 82 });
    frames.push({ ...checkpoint, screenshot, observed });
  }
  assert.deepEqual(pageErrors, [], "真实时间线预览页面有运行错误");
  await page.close();
} finally {
  await browser.close();
}

const contactSheet = path.join(evidenceDir, "contact-sheet.jpg");
const ffmpegArgs = ["-hide_banner", "-loglevel", "error", "-y"];
for (const frame of frames) ffmpegArgs.push("-i", frame.screenshot);
const scaledInputs = frames.map((_, index) => `[${index}:v]scale=960:540[v${index}]`).join(";");
const stackInputs = frames.map((_, index) => `[v${index}]`).join("");
ffmpegArgs.push(
  "-filter_complex",
  `${scaledInputs};${stackInputs}xstack=inputs=${frames.length}:layout=0_0|960_0|0_540|960_540|0_1080|960_1080`,
  "-frames:v",
  "1",
  contactSheet,
);
execFileSync("ffmpeg", ffmpegArgs, { cwd: ROOT, stdio: "pipe" });

console.log(JSON.stringify({ status: "pass", contactSheet, frames }, null, 2));
