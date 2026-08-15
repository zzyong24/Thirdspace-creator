#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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
    "用法: node verify-t842-opening-preview.mjs <task-record.json> <pglite-db> <media-root> <talking-head-video> <output-dir>",
  );
}

const evidenceDir = path.resolve(outputDir);
mkdirSync(evidenceDir, { recursive: true });
const tempRoot = mkdtempSync(path.join(tmpdir(), "creatoros-t842-opening."));
const workDir = path.join(tempRoot, "work");
mkdirSync(workDir, { recursive: true });

try {
  const record = JSON.parse(readFileSync(path.resolve(taskRecordFile), "utf8"));
  const props = record.task?.[0]?.input_data?.spec?.params?.props;
  if (!props?.scenes?.[0] || !Array.isArray(props.broll)) {
    throw new Error("任务记录缺少真实渲染 props");
  }
  const firstScene = props.scenes[0];
  const previewEnd = Math.min(firstScene.endSec, 3.37);
  const creatorOs = props.broll.find((item) =>
    String(item.label).toLocaleLowerCase("zh-CN").includes("creatoros选题写稿页面"),
  );
  if (!creatorOs) {
    throw new Error("真实时间线缺少本次开场已匹配的 CreatorOS 录屏素材");
  }

  // 只验收用户指出的 0～3.37 秒：语义素材仍来自原始 AI 选择，脚本只落实
  // “第一帧起、前三秒真实素材优先”的时间与呈现约束，不改后续画中画布局。
  const previewBroll = [
    {
      ...creatorOs,
      at: 0,
      durationSec: previewEnd,
      presentation: "full_frame",
      visualRole: "screen_recording",
      speakerMode: "hidden",
      motion: "static",
    },
  ];
  props.meta = {
    ...props.meta,
    title: `${props.meta.title}｜开场前三秒真实素材预览`,
  };
  props.talkingHead.durationSec = previewEnd;
  props.scenes = [{ ...firstScene, endSec: previewEnd, cards: [] }];
  props.captions = props.captions
    .filter((caption) => caption.start < previewEnd)
    .map((caption) => ({ ...caption, end: Math.min(caption.end, previewEnd) }));
  props.broll = previewBroll;

  const previewRecord = path.join(tempRoot, "task-record.json");
  writeFileSync(previewRecord, `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(
    path.join(evidenceDir, "preview-plan.json"),
    `${JSON.stringify(
      {
        sourceTaskRecord: path.resolve(taskRecordFile),
        previewWindow: [0, previewEnd],
        principle: "第一帧起连续三秒优先真实素材；本预览不修改三秒后的画中画布局",
        broll: previewBroll.map((item) => ({
          assetId: item.file,
          label: item.label,
          at: item.at,
          durationSec: item.durationSec,
          presentation: item.presentation,
          speakerMode: item.speakerMode,
        })),
      },
      null,
      2,
    )}\n`,
  );

  const talkingHeadPreview = path.join(tempRoot, "talking-head.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-t",
      String(previewEnd),
      "-i",
      path.resolve(sourceTalkingHead),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      talkingHeadPreview,
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  const htmlFile = path.join(workDir, "index.html");
  execFileSync(
    path.join(ROOT, "backend/node_modules/.bin/tsx"),
    [
      path.join(ROOT, "backend/scripts/t839-real-timeline-preview.ts"),
      previewRecord,
      path.resolve(databasePath),
      path.resolve(mediaRoot),
      htmlFile,
      talkingHeadPreview,
      workDir,
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  const silentPreviewVideo = path.join(tempRoot, "opening-silent.mp4");
  execFileSync(
    path.join(ROOT, "backend/node_modules/.bin/hyperframes"),
    [
      "render",
      workDir,
      "-o",
      silentPreviewVideo,
      "-q",
      "draft",
      "-f",
      "30",
      "-w",
      "2",
      "--quiet",
    ],
    {
      cwd: ROOT,
      env: { ...process.env, HYPERFRAMES_TELEMETRY: "0" },
      stdio: "pipe",
      timeout: 300_000,
    },
  );

  const previewVideo = path.join(evidenceDir, "opening-0-3.37s-preview.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      silentPreviewVideo,
      "-i",
      talkingHeadPreview,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0?",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-shortest",
      "-movflags",
      "+faststart",
      previewVideo,
    ],
    { cwd: ROOT, stdio: "pipe" },
  );

  const checkpoints = [0, 0.08, 1.5, Math.max(0.08, previewEnd - 0.05)];
  const frames = [];
  for (const time of checkpoints) {
    const frame = path.join(
      evidenceDir,
      `frame-${time.toFixed(2).replace(/0$/, "")}s.jpg`,
    );
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(time),
        "-i",
        previewVideo,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        frame,
      ],
      { cwd: ROOT, stdio: "pipe" },
    );
    frames.push(frame);
  }

  const contactSheet = path.join(evidenceDir, "opening-contact-sheet.jpg");
  const ffmpegArgs = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const frame of frames) ffmpegArgs.push("-i", frame);
  ffmpegArgs.push(
    "-filter_complex",
    "[0:v]scale=960:540[v0];[1:v]scale=960:540[v1];[2:v]scale=960:540[v2];[3:v]scale=960:540[v3];[v0][v1][v2][v3]xstack=inputs=4:layout=0_0|960_0|0_540|960_540",
    "-frames:v",
    "1",
    contactSheet,
  );
  execFileSync("ffmpeg", ffmpegArgs, { cwd: ROOT, stdio: "pipe" });

  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=codec_name,width,height,avg_frame_rate",
        "-of",
        "json",
        previewVideo,
      ],
      { encoding: "utf8" },
    ),
  );
  writeFileSync(
    path.join(evidenceDir, "preview-probe.json"),
    `${JSON.stringify(probe, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      { status: "pass", previewVideo, contactSheet, frames, probe },
      null,
      2,
    ),
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
