#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [taskRecordFile, databasePath, mediaRoot, sourceTalkingHead, outputDir] =
  process.argv.slice(2);
if (
  !taskRecordFile ||
  !databasePath ||
  !mediaRoot ||
  !sourceTalkingHead ||
  !outputDir
) {
  throw new Error(
    "用法: node verify-t858-unified-stage-preview.mjs <task-record.json> <pglite-db> <media-root> <talking-head-video> <output-dir>",
  );
}

const previewDuration = 14;
const evidenceDir = path.resolve(outputDir);
mkdirSync(evidenceDir, { recursive: true });
const tempRoot = mkdtempSync(path.join(tmpdir(), "creatoros-t858-preview."));
const workDir = path.join(tempRoot, "work");
mkdirSync(workDir, { recursive: true });

const record = JSON.parse(readFileSync(path.resolve(taskRecordFile), "utf8"));
const props = record.task?.[0]?.input_data?.spec?.params?.props;
if (!props?.scenes?.[1] || !Array.isArray(props.broll) || !Array.isArray(props.captions)) {
  throw new Error("任务记录缺少真实渲染 props");
}
const previewBroll = props.broll
  .filter((item) => item.at < 7.083)
  .slice(0, 2)
  .map(({ speakerMode: _speakerMode, ...item }) => ({
    ...item,
    big: false,
    presentation: "full_frame",
    visualRole: "screen_recording",
    speakerMode: "pip_bottom_left",
    motion: "static",
  }));
if (previewBroll.length !== 2) {
  throw new Error("真实时间线缺少两个连续的横版主视觉素材");
}

// 这是视觉验收用的显式编导候选夹具：内容选择被逐项写明，脚本不通过关键词或
// 相似度猜语义。生产链的重点词必须由 video.subtitles AI 返回并通过同一契约。
const captionDecisions = [
  { cn: "这套选题写稿", en: "This topic-to-script workflow", emphasis: ["选题写稿", 2, 6] },
  { cn: "审稿的循环", en: "and its review loop", emphasis: ["循环", 3, 5] },
  { cn: "在我自己项目里面", en: "inside my own project", emphasis: ["自己项目", 2, 6] },
  { cn: "整整串了三周的位", en: "kept mixing context for three weeks", emphasis: ["三周", 4, 6] },
  { cn: "最后是Deepseekalys的", en: "Then a DeepSeek analysis", emphasis: ["最后", 0, 2] },
  { cn: "一份文档把我点醒了", en: "finally made the problem click", emphasis: ["点醒", 6, 8] },
  { cn: "我们做内容操盘的应该都懂", en: "Content operators know this feeling", emphasis: ["内容操盘", 3, 7] },
  { cn: "选题是让AI在跑", en: "AI is running topic selection", emphasis: ["AI", 4, 6] },
  { cn: "写稿也是在让AI在跑", en: "AI is also drafting the script", emphasis: ["AI", 6, 8] },
  { cn: "甚至最后的审稿也是AI在跑", en: "and AI is reviewing it too", emphasis: ["AI", 9, 11] },
  { cn: "那听起来很爽", en: "That sounds effortless", emphasis: ["很爽", 4, 6] },
];

const dynamicCard = {
  ...props.scenes[1].cards[0],
  at: 7.083,
  visualPlan: {
    relation: "sequence",
    parts: [
      { text: "选题是让AI在跑", role: "step" },
      { text: "写稿也是在让AI在跑", role: "step" },
    ],
  },
};

props.meta = { ...props.meta, title: `${props.meta.title}｜T-860 边界分离短样片 v7` };
props.delivery = { width: 1080, height: 1920, fps: 30 };
props.talkingHead.durationSec = previewDuration;
props.scenes = [
  { ...props.scenes[0], startSec: 0, endSec: 7.083, cards: [], special: undefined },
  {
    ...props.scenes[1],
    startSec: 7.083,
    endSec: previewDuration,
    cards: [dynamicCard],
    special: undefined,
  },
];
props.broll = previewBroll;
props.captions = props.captions
  .filter((caption) => caption.start < previewDuration)
  .map((caption, index) => {
    const authored = captionDecisions[index];
    const end = Math.min(caption.end, previewDuration);
    if (!authored || authored.cn !== caption.cn) {
      return { ...caption, end };
    }
    const [text, startChar, endChar] = authored.emphasis;
    return {
      ...caption,
      end,
      en: authored.en,
      emphasis: [
        {
          text,
          startChar,
          endChar,
          startSec: Math.min(end - 0.12, caption.start + 0.18),
          endSec: Math.max(caption.start + 0.3, end - 0.08),
        },
      ],
    };
  });
props.direction = {
  motionThesis: "竖屏素材成为主画面时人物平滑收进左下角；连续素材人物不动，动态内容独占后平滑回到全屏人物。",
  beatGraph: [
    {
      id: "person_base_open",
      sceneIdx: 0,
      startSec: 0,
      endSec: previewBroll[0].at,
      subject: { kind: "talking_head", ref: "talking_head" },
      startState: "base",
      endState: "base",
      motionVerb: "hold",
      stageMode: "base",
      transitionIn: "cut",
      transitionOut: "slide",
      returnGeometry: "not_applicable",
    },
    ...previewBroll.map((item, index) => ({
      id: `evidence_${index + 1}`,
      sceneIdx: 0,
      startSec: item.at,
      endSec: Math.min(7.083, item.at + item.durationSec),
      subject: { kind: "broll", ref: `broll:${item.file}` },
      startState: "off_canvas",
      endState: "takeover",
      motionVerb: index === 0 ? "enter" : "replace",
      stageMode: "takeover",
      transitionIn: "fade",
      transitionOut: "fade",
      returnGeometry: "same_base",
    })),
    {
      id: "dynamic_ppt_sequence",
      sceneIdx: 1,
      startSec: 7.083,
      endSec: 11.4,
      subject: { kind: "card", ref: "card:1:0" },
      startState: "off_canvas",
      endState: "takeover",
      motionVerb: "reveal",
      stageMode: "takeover",
      transitionIn: "slide",
      transitionOut: "fade",
      returnGeometry: "same_base",
    },
    {
      id: "person_base_return",
      sceneIdx: 1,
      startSec: 11.4,
      endSec: previewDuration,
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
};

writeFileSync(
  path.join(evidenceDir, "preview-plan-v7.json"),
  `${JSON.stringify(
    {
      sourceTaskRecord: path.resolve(taskRecordFile),
      previewWindow: [0, previewDuration],
      delivery: props.delivery,
      motionThesis: props.direction.motionThesis,
      beatGraph: props.direction.beatGraph,
      captions: props.captions,
      note: "重点词为显式验收候选夹具；生产候选由 video.subtitles AI 生成，同一契约校验与渲染链落实。",
    },
    null,
    2,
  )}\n`,
);

const previewRecord = path.join(tempRoot, "task-record.json");
writeFileSync(previewRecord, `${JSON.stringify(record, null, 2)}\n`);
const talkingHeadPreview = path.join(tempRoot, "talking-head.mp4");
execFileSync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-y", "-t", String(previewDuration),
    "-i", path.resolve(sourceTalkingHead), "-c:v", "libx264", "-preset", "veryfast",
    "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", talkingHeadPreview,
  ],
  { cwd: ROOT, stdio: "pipe" },
);

execFileSync(
  path.join(ROOT, "backend/node_modules/.bin/tsx"),
  [
    path.join(ROOT, "backend/scripts/t839-real-timeline-preview.ts"),
    previewRecord,
    path.resolve(databasePath),
    path.resolve(mediaRoot),
    path.join(workDir, "index.html"),
    talkingHeadPreview,
    workDir,
  ],
  { cwd: ROOT, stdio: "pipe" },
);

const silentVideo = path.join(tempRoot, "preview-silent.mp4");
execFileSync(
  path.join(ROOT, "backend/node_modules/.bin/hyperframes"),
  ["render", workDir, "-o", silentVideo, "-q", "draft", "-f", "30", "-w", "2", "--quiet"],
  {
    cwd: ROOT,
    env: { ...process.env, HYPERFRAMES_TELEMETRY: "0" },
    stdio: "pipe",
    timeout: 600_000,
  },
);

const previewVideo = path.join(evidenceDir, "portrait-material-pip-14s-preview-v7.mp4");
execFileSync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-y", "-i", silentVideo,
    "-i", talkingHeadPreview, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", previewVideo,
  ],
  { cwd: ROOT, stdio: "pipe" },
);

const checkpoints = [0.8, 3.8, 6.2, 8.2, 10.2, 12.2];
const frames = checkpoints.map((time) => {
  const frame = path.join(evidenceDir, `frame-v7-${time.toFixed(1)}s.jpg`);
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(time), "-i", previewVideo, "-frames:v", "1", "-q:v", "2", frame],
    { cwd: ROOT, stdio: "pipe" },
  );
  return frame;
});

const contactSheet = path.join(evidenceDir, "contact-sheet-v7.jpg");
const sheetArgs = ["-hide_banner", "-loglevel", "error", "-y"];
for (const frame of frames) sheetArgs.push("-i", frame);
sheetArgs.push(
  "-filter_complex",
  "[0:v]scale=360:640[v0];[1:v]scale=360:640[v1];[2:v]scale=360:640[v2];[3:v]scale=360:640[v3];[4:v]scale=360:640[v4];[5:v]scale=360:640[v5];[v0][v1][v2][v3][v4][v5]xstack=inputs=6:layout=0_0|360_0|720_0|0_640|360_640|720_640",
  "-frames:v", "1", contactSheet,
);
execFileSync("ffmpeg", sheetArgs, { cwd: ROOT, stdio: "pipe" });

const transitionTimes = [
  previewBroll[0].at,
  previewBroll[1].at,
  7.083,
  11.4,
];
const denseFrames = [];
for (const boundary of transitionTimes) {
  for (const delta of [-0.12, -0.03, 0.07, 0.16]) {
    const time = Math.max(0, Math.min(previewDuration - 0.04, boundary + delta));
    const frame = path.join(
      evidenceDir,
      `transition-v7-${boundary.toFixed(3)}-${delta >= 0 ? "p" : "m"}${Math.abs(delta).toFixed(2)}.jpg`,
    );
    execFileSync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(time), "-i", previewVideo, "-frames:v", "1", "-q:v", "2", frame],
      { cwd: ROOT, stdio: "pipe" },
    );
    denseFrames.push(frame);
  }
}
const transitionSheet = path.join(evidenceDir, "transition-contact-sheet-v7.jpg");
const denseArgs = ["-hide_banner", "-loglevel", "error", "-y"];
for (const frame of denseFrames) denseArgs.push("-i", frame);
const denseFilters = denseFrames.map(
  (_frame, index) => `[${index}:v]scale=270:480[v${index}]`,
);
const denseLayout = denseFrames
  .map((_frame, index) => `${(index % 4) * 270}_${Math.floor(index / 4) * 480}`)
  .join("|");
denseArgs.push(
  "-filter_complex",
  `${denseFilters.join(";")};${denseFrames.map((_frame, index) => `[v${index}]`).join("")}xstack=inputs=${denseFrames.length}:layout=${denseLayout}`,
  "-frames:v", "1", transitionSheet,
);
execFileSync("ffmpeg", denseArgs, { cwd: ROOT, stdio: "pipe" });

const probe = JSON.parse(
  execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", previewVideo], { encoding: "utf8" }),
);
const result = { status: "pass", previewVideo, contactSheet, transitionSheet, frames, denseFrames, probe };
writeFileSync(path.join(evidenceDir, "preview-result-v7.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
