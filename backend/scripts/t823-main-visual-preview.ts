/** T-823 主视觉优先预览：用一张高信息图验证主图、短标注、人物与字幕四区互不遮挡。 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generateVideoRenderHtml } from "../src/modules/execution/video-render/template";
import type { VideoRenderProps } from "@creatoros/contract";

const output = process.argv[2];
const talkingHead = process.argv[3];
const architectureImage = process.argv[4];
if (!output || !talkingHead || !architectureImage) {
  throw new Error("用法: tsx t823-main-visual-preview.ts <html> <talking-head.mp4> <architecture-image>");
}

const talkingHeadUrl = pathToFileURL(resolve(talkingHead)).href;
const imageUrl = pathToFileURL(resolve(architectureImage)).href;
const props: VideoRenderProps = {
  meta: { title: "T-823 主视觉优先预览", brandLabel: "CreatorOS" },
  delivery: { width: 1920, height: 1080, fps: 30 },
  talkingHead: { file: talkingHeadUrl, durationSec: 12, hasAudio: false },
  captions: [
    { start: 0, end: 6, cn: "再往上是模式层" },
    { start: 6, end: 12, cn: "最顶上是我们的可观测层" },
  ],
  scenes: [
    {
      id: "architecture",
      label: "ARCHITECTURE",
      title: "Harness 四层架构",
      startSec: 0,
      endSec: 12,
      role: "body",
      cards: [
        { kind: "quote", at: 0, text: "模式层 · 标准 / PTC / 极简 / 创造" },
        { kind: "quote", at: 6, text: "可观测层 · append-only 事件流" },
      ],
    },
  ],
  broll: [
    {
      at: 0,
      file: imageUrl,
      label: "Harness 四层架构图",
      big: false,
      durationSec: 12,
      presentation: "large_stage",
      visualRole: "still_image",
      motion: "static",
      sourceWidth: 1024,
      sourceHeight: 1024,
    },
  ],
};

writeFileSync(
  resolve(output),
  generateVideoRenderHtml(props, {
    gsapSrc: new URL("../node_modules/gsap/dist/gsap.min.js", import.meta.url).href,
    mediaPrefix: "",
    imageFiles: new Set([imageUrl]),
  }),
  "utf8",
);

console.log(resolve(output));
