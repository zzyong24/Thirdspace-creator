#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { videoRenderProps } from "../../contract/src/index";
import {
  assertVideoLayoutSafety,
  generateVideoRenderHtml,
  stabilizeVideoLayoutSafety,
} from "../../backend/src/modules/execution/video-render/template";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temp = mkdtempSync(path.join(tmpdir(), "creatoros-t896-layout-"));
const mediaDir = path.join(temp, "media");
mkdirSync(mediaDir, { recursive: true });

const ffmpeg = "ffmpeg";
const ffprobe = "ffprobe";
const hyperframes = path.join(ROOT, "backend/node_modules/.bin/hyperframes");

try {
  execFileSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x273043:s=1080x1920:r=30:d=3",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=3",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      path.join(mediaDir, "talking-head.mp4"),
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  for (const [name, size, color] of [
    ["square.png", "1024x1024", "0x4f46e5"],
    ["portrait.png", "1080x1920", "0x0891b2"],
  ] as const) {
    execFileSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=${color}:s=${size}`,
        "-frames:v",
        "1",
        path.join(mediaDir, name),
      ],
      { cwd: ROOT, stdio: "pipe" },
    );
  }

  const input = videoRenderProps.parse({
    meta: { title: "T-896 布局安全降级真实渲染" },
    talkingHead: {
      file: "talking-head.mp4",
      durationSec: 3,
      hasAudio: true,
    },
    captions: [{ start: 0, end: 3, cn: "方图和竖图都要继续出片" }],
    scenes: [
      {
        id: "scene-1",
        label: "SCENE 1",
        title: "布局安全降级",
        startSec: 0,
        endSec: 3,
        role: "body",
        cards: [],
      },
    ],
    broll: [
      {
        at: 0.2,
        file: "square.png",
        durationSec: 1.2,
        label: "方图",
        presentation: "full_frame",
        visualRole: "screen_recording",
        speakerMode: "pip_bottom_left",
        sourceWidth: 1024,
        sourceHeight: 1024,
      },
      {
        at: 1.5,
        file: "portrait.png",
        durationSec: 1.2,
        label: "竖图",
        presentation: "full_frame",
        visualRole: "screen_recording",
        speakerMode: "pip_bottom_left",
        sourceWidth: 1080,
        sourceHeight: 1920,
      },
    ],
    direction: {
      motionThesis: "问题素材接管时隐藏辅助人物，保持主素材完整可见。",
      beatGraph: [
        {
          id: "base-open",
          sceneIdx: 0,
          startSec: 0,
          endSec: 0.2,
          subject: { kind: "talking_head", ref: "talking_head" },
          startState: "base",
          endState: "base",
          motionVerb: "hold",
          stageMode: "base",
          transitionIn: "cut",
          transitionOut: "fade",
          returnGeometry: "not_applicable",
        },
        {
          id: "square",
          sceneIdx: 0,
          startSec: 0.2,
          endSec: 1.4,
          subject: { kind: "broll", ref: "broll:square.png" },
          startState: "off_canvas",
          endState: "takeover",
          motionVerb: "enter",
          stageMode: "takeover",
          transitionIn: "fade",
          transitionOut: "fade",
          returnGeometry: "same_base",
        },
        {
          id: "base-middle",
          sceneIdx: 0,
          startSec: 1.4,
          endSec: 1.5,
          subject: { kind: "talking_head", ref: "talking_head" },
          startState: "base",
          endState: "base",
          motionVerb: "hold",
          stageMode: "base",
          transitionIn: "cut",
          transitionOut: "fade",
          returnGeometry: "not_applicable",
        },
        {
          id: "portrait",
          sceneIdx: 0,
          startSec: 1.5,
          endSec: 2.7,
          subject: { kind: "broll", ref: "broll:portrait.png" },
          startState: "off_canvas",
          endState: "takeover",
          motionVerb: "replace",
          stageMode: "takeover",
          transitionIn: "fade",
          transitionOut: "fade",
          returnGeometry: "same_base",
        },
        {
          id: "base-close",
          sceneIdx: 0,
          startSec: 2.7,
          endSec: 3,
          subject: { kind: "talking_head", ref: "talking_head" },
          startState: "base",
          endState: "base",
          motionVerb: "hold",
          stageMode: "base",
          transitionIn: "fade",
          transitionOut: "cut",
          returnGeometry: "not_applicable",
        },
      ],
    },
    delivery: { width: 1080, height: 1920, fps: 30 },
  });

  const stabilized = stabilizeVideoLayoutSafety(input);
  assert.deepEqual(
    stabilized.props.broll.map((item) => item.speakerMode),
    ["hidden", "hidden"],
  );
  assert.equal(stabilized.fallbacks.length, 2);
  assert.doesNotThrow(() => assertVideoLayoutSafety(stabilized.props));

  const html = generateVideoRenderHtml(stabilized.props, {
    mediaPrefix: "media/",
    imageFiles: new Set(["square.png", "portrait.png"]),
  });
  assert.doesNotMatch(
    html,
    /left:54,top:1188,width:264,height:469,borderRadius:24/,
  );
  writeFileSync(path.join(temp, "index.html"), html, "utf8");
  copyFileSync(
    path.join(ROOT, "backend/node_modules/gsap/dist/gsap.min.js"),
    path.join(temp, "gsap.min.js"),
  );

  const output = path.join(temp, "fallback-smoke.mp4");
  execFileSync(
    hyperframes,
    ["render", temp, "-o", output, "-q", "draft", "-f", "30", "-w", "1", "--quiet"],
    {
      cwd: ROOT,
      env: { ...process.env, HYPERFRAMES_TELEMETRY: "0" },
      stdio: "pipe",
      timeout: 300_000,
    },
  );
  const probe = JSON.parse(
    execFileSync(
      ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate:format=duration",
        "-of",
        "json",
        output,
      ],
      { cwd: ROOT, encoding: "utf8" },
    ),
  );
  assert.equal(probe.streams?.[0]?.width, 1080);
  assert.equal(probe.streams?.[0]?.height, 1920);
  assert.ok(Number(probe.format?.duration) >= 2.9);

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      fallbacks: stabilized.fallbacks,
      delivery: probe,
    })}\n`,
  );
} finally {
  if (process.env.KEEP_T896_SMOKE !== "1") {
    rmSync(temp, { recursive: true, force: true });
  } else {
    process.stderr.write(`T-896 smoke kept at ${temp}\n`);
  }
}
