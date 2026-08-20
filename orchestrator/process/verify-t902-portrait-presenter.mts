#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { videoRenderProps } from "../../contract/src/index";
import {
  assertVideoLayoutSafety,
  generateVideoRenderHtml,
  stabilizeVideoLayoutSafety,
} from "../../backend/src/modules/execution/video-render/template";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceArg = process.argv[2];
const outputArg = process.argv[3];
if (!sourceArg || !outputArg) {
  throw new Error("用法: verify-t902-portrait-presenter.mts <真实竖屏人物视频> <输出目录>");
}
const source = path.resolve(sourceArg);
const outputDir = path.resolve(outputArg);

const workDir = path.join(outputDir, "work");
const mediaDir = path.join(workDir, "media");
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(mediaDir, { recursive: true });

const ffmpeg = "ffmpeg";
const hyperframes = path.join(ROOT, "backend/node_modules/.bin/hyperframes");
execFileSync(
  ffmpeg,
  [
    "-hide_banner", "-loglevel", "error", "-y", "-ss", "5", "-i", source,
    "-t", "6", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
    path.join(mediaDir, "talking-head.mp4"),
  ],
  { cwd: ROOT, stdio: "pipe" },
);
execFileSync(
  ffmpeg,
  [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
    "color=c=0x3547a8:s=1024x1024", "-vf",
    "drawbox=x=90:y=90:w=844:h=844:color=0x8497ff:t=12,drawbox=x=190:y=250:w=644:h=100:color=white@0.85:t=fill,drawbox=x=190:y=430:w=520:h=60:color=white@0.55:t=fill",
    "-frames:v", "1", path.join(mediaDir, "support.png"),
  ],
  { cwd: ROOT, stdio: "pipe" },
);

const input = videoRenderProps.parse({
  meta: { title: "T-902 竖屏真人主导真实预览" },
  talkingHead: { file: "talking-head.mp4", durationSec: 6, hasAudio: true },
  captions: [{ start: 0, end: 6, cn: "竖屏真人主导，人脸全程常驻" }],
  scenes: [
    {
      id: "presenter-first",
      label: "真人主导",
      title: "卡片与素材只做辅助",
      startSec: 0,
      endSec: 6,
      role: "body",
      cards: [{ kind: "quote", at: 1, text: "真人是主画面", tone: "accent" }],
    },
  ],
  broll: [
    {
      at: 3,
      file: "support.png",
      label: "历史 hidden 方图",
      big: false,
      durationSec: 2,
      presentation: "large_stage",
      visualRole: "still_image",
      speakerMode: "hidden",
      sourceWidth: 1024,
      sourceHeight: 1024,
    },
  ],
  direction: {
    motionThesis: "真人全程在场，卡片与素材仅作短时辅助。",
    beatGraph: [
      {
        id: "person-open", sceneIdx: 0, startSec: 0, endSec: 1,
        subject: { kind: "talking_head", ref: "talking_head" },
        startState: "base", endState: "base", motionVerb: "hold", stageMode: "base",
        transitionIn: "cut", transitionOut: "fade", returnGeometry: "not_applicable",
      },
      {
        id: "support-card", sceneIdx: 0, startSec: 1, endSec: 3,
        subject: { kind: "card", ref: "card:0:0" },
        startState: "base", endState: "takeover", motionVerb: "reveal", stageMode: "takeover",
        transitionIn: "fade", transitionOut: "fade", returnGeometry: "same_base",
      },
      {
        id: "support-image", sceneIdx: 0, startSec: 3, endSec: 5,
        subject: { kind: "broll", ref: "broll:support.png" },
        startState: "off_canvas", endState: "takeover", motionVerb: "replace", stageMode: "takeover",
        transitionIn: "fade", transitionOut: "fade", returnGeometry: "same_base",
      },
      {
        id: "person-close", sceneIdx: 0, startSec: 5, endSec: 6,
        subject: { kind: "talking_head", ref: "talking_head" },
        startState: "base", endState: "base", motionVerb: "hold", stageMode: "base",
        transitionIn: "fade", transitionOut: "cut", returnGeometry: "not_applicable",
      },
    ],
  },
  delivery: { width: 1080, height: 1920, fps: 30 },
});

const stabilized = stabilizeVideoLayoutSafety(input);
assert.equal(stabilized.props.broll[0]?.speakerMode, "pip_bottom_left");
assert.doesNotThrow(() => assertVideoLayoutSafety(stabilized.props));
const html = generateVideoRenderHtml(stabilized.props, {
  mediaPrefix: "media/",
  imageFiles: new Set(["support.png"]),
});
assert.doesNotMatch(html, /(?:to|set)\("#th",\{[^}]*autoAlpha:0/);
assert.match(html, /left:54,top:1188,width:264,height:469,borderRadius:24/);
writeFileSync(path.join(workDir, "index.html"), html, "utf8");
copyFileSync(
  path.join(ROOT, "backend/node_modules/gsap/dist/gsap.min.js"),
  path.join(workDir, "gsap.min.js"),
);

const preview = path.join(outputDir, "t902-presenter-first.mp4");
execFileSync(
  hyperframes,
  ["render", workDir, "-o", preview, "-q", "draft", "-f", "30", "-w", "1", "--quiet"],
  { cwd: ROOT, env: { ...process.env, HYPERFRAMES_TELEMETRY: "0" }, stdio: "pipe", timeout: 300_000 },
);
const contact = path.join(outputDir, "contact-sheet.jpg");
execFileSync(
  ffmpeg,
  [
    "-hide_banner", "-loglevel", "error", "-y", "-i", preview,
    "-vf", "fps=2/3,scale=270:480,tile=4x1", "-frames:v", "1", contact,
  ],
  { cwd: ROOT, stdio: "pipe" },
);
rmSync(workDir, { recursive: true, force: true });
process.stdout.write(`${JSON.stringify({ ok: true, preview, contact })}\n`);
