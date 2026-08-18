/** T-876：横屏连续舞台预览——语义内容卡、原句动效、真实素材。 */
import { writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { videoRenderProps } from "@creatoros/contract";
import { generateVideoRenderHtml } from "../src/modules/execution/video-render/template";

const [output, talkingHead, brollImage] = process.argv.slice(2);
if (!output || !talkingHead || !brollImage) {
  throw new Error(
    "用法: tsx t876-empty-stage-preview.ts <html> <talking-head.mp4> <broll-image>",
  );
}

const talkingHeadFile = basename(talkingHead);
const brollFile = basename(brollImage);
const props = videoRenderProps.parse({
  meta: { title: "T-876 无素材也必须有动效", brandLabel: "CreatorOS" },
  delivery: { width: 1920, height: 1080, fps: 30 },
  talkingHead: { file: talkingHeadFile, durationSec: 12, hasAudio: false },
  captions: [
    { start: 0, end: 4, cn: "没有真实素材时，先用语义内容动效承接" },
    { start: 4, end: 8, cn: "主视觉切换缝隙由原句内容动效安全承接" },
    { start: 8, end: 12, cn: "真实素材出现后，再由素材接管主舞台" },
  ],
  scenes: [
    {
      id: "fallback-chain",
      label: "NO EMPTY STAGE",
      title: "没有素材，也不能没有画面",
      startSec: 0,
      endSec: 12,
      role: "body",
      cards: [
        {
          kind: "list",
          at: 0,
          title: "画面兜底优先级",
          items: [
            { text: "真实素材", tone: "green" },
            { text: "语义内容动效", tone: "accent" },
            { text: "原句内容动效", tone: "amber" },
          ],
        },
      ],
    },
  ],
  direction: {
    motionThesis: "内容动效建立原则，原句动效承接空窗，真实素材最后接管。",
    beatGraph: [
      {
        id: "semantic-motion",
        sceneIdx: 0,
        startSec: 0,
        endSec: 4,
        subject: { kind: "card", ref: "card:0:0" },
        startState: "off_canvas",
        endState: "takeover",
        motionVerb: "reveal",
        stageMode: "takeover",
        transitionIn: "fade",
        transitionOut: "cut",
        returnGeometry: "same_base",
      },
      {
        id: "talking-head-fallback",
        sceneIdx: 0,
        startSec: 4,
        endSec: 8,
        subject: { kind: "talking_head", ref: "talking_head" },
        startState: "base",
        endState: "base",
        motionVerb: "focus",
        stageMode: "base",
        transitionIn: "scale",
        transitionOut: "cut",
        returnGeometry: "not_applicable",
      },
      {
        id: "real-material",
        sceneIdx: 0,
        startSec: 8,
        endSec: 12,
        subject: { kind: "broll", ref: `broll:${brollFile}` },
        startState: "off_canvas",
        endState: "takeover",
        motionVerb: "enter",
        stageMode: "takeover",
        transitionIn: "cut",
        transitionOut: "fade",
        returnGeometry: "same_base",
      },
    ],
  },
  broll: [
    {
      at: 8,
      file: brollFile,
      label: "真实素材接管",
      big: false,
      durationSec: 4,
      presentation: "large_stage",
      visualRole: "still_image",
      motion: "push_in",
      sourceWidth: 1920,
      sourceHeight: 1080,
    },
  ],
});

writeFileSync(
  resolve(output),
  generateVideoRenderHtml(props, {
    gsapSrc: "gsap.min.js",
    mediaPrefix: "",
    imageFiles: new Set([brollFile]),
  }),
  "utf8",
);

console.log(resolve(output));
