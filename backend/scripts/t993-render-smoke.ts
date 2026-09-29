/**
 * T-993 手动真实渲染冒烟：只在系统临时目录创建合成视频与成片，
 * 不读取 CreatorOS 数据库、用户媒体或模型配置。
 * 运行：pnpm -C backend exec tsx scripts/t993-render-smoke.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { videoRenderProps } from "@creatoros/contract";
import { createVideoRenderExecutor } from "../src/modules/execution/video-render/executor";

const root = await mkdtemp(path.join(tmpdir(), "creatoros-t993-render-"));
const inputDir = path.join(root, "input");
const outDir = path.join(root, "out");
await mkdir(inputDir);
await mkdir(outDir);
const source = path.join(inputDir, "talking-head.mp4");
execFileSync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24:duration=3",
  "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=3",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source,
]);
const props = videoRenderProps.parse({
  meta: { title: "T-993 渲染回归", brandLabel: "测试" },
  talkingHead: { file: "talking-head.mp4", durationSec: 3 },
  captions: [{ start: 0, end: 2.8, cn: "画布回归", en: "Canvas regression" }],
  scenes: [{ id: "s1", label: "TEST", title: "画布回归", startSec: 0, endSec: 3, role: "hook", cards: [] }],
  broll: [],
  delivery: { width: 1280, height: 720, fps: 24 },
});
const executor = createVideoRenderExecutor();
const result = await executor.run({
  taskId: "t993-render-smoke", dir: root, inputDir, outDir,
  inputs: [{ assetId: "fixture", mountAs: "talking-head.mp4", size: (await stat(source)).size, mimeType: "video/mp4" }],
}, { props }, {
  signal: new AbortController().signal,
  reportStep: async (line) => { process.stdout.write(`${line}\n`); },
});
const finalFile = path.join(outDir, "final.mp4");
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_name,width,height", "-of", "json", finalFile], { encoding: "utf8" }));
process.stdout.write(`${JSON.stringify({ root, result, probe })}\n`);
