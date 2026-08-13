/** T-794 确定性动效卡片预览：不调模型、不读用户数据，只生成五种关系的本地 HTML。 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateVideoRenderHtml } from "../src/modules/execution/video-render/template";
import type { VideoRenderProps } from "@creatoros/contract";

const output = resolve(
  process.argv[2] ?? "/tmp/creatoros-t794-motion-card-preview.html",
);
const portrait = process.argv[3] === "portrait";

const props: VideoRenderProps = {
  meta: { title: "T-794 内容驱动动效卡片", brandLabel: "CreatorOS" },
  delivery: portrait
    ? { width: 1080, height: 1920, fps: 30 }
    : { width: 1920, height: 1080, fps: 30 },
  talkingHead: {
    file: "data:video/mp4;base64,",
    durationSec: 15,
    hasAudio: false,
  },
  captions: [
    { start: 0, end: 15, cn: "字幕安全区：内容关系必须在上方主舞台清楚发生" },
  ],
  broll: [],
  scenes: [
    {
      id: "motion-loop",
      label: "预览",
      title: "内容关系",
      startSec: 0,
      endSec: 15,
      role: "body",
      cards: [
        {
          kind: "stat",
          at: 0,
          value: "47%",
          label: "效率提升 47%",
          visualPlan: {
            relation: "magnitude",
            parts: [
              { text: "效率提升", role: "subject" },
              { text: "47%", role: "measure" },
            ],
          },
        },
        {
          kind: "compare",
          at: 3,
          left: { title: "旧流程", items: ["整段交给 AI"] },
          right: { title: "新流程", items: ["先定位卡点"] },
          visualPlan: {
            relation: "contrast",
            parts: [
              { text: "整段交给 AI", role: "old" },
              { text: "先定位卡点", role: "new" },
            ],
          },
        },
        {
          kind: "list",
          at: 6,
          items: [{ text: "输入" }, { text: "处理" }, { text: "输出" }],
          visualPlan: {
            relation: "sequence",
            parts: [
              { text: "输入", role: "step" },
              { text: "处理", role: "step" },
              { text: "输出", role: "step" },
            ],
          },
        },
        {
          kind: "list",
          at: 9,
          items: [{ text: "模糊输入" }, { text: "无法定位" }, { text: "盲目换工具" }],
          visualPlan: {
            relation: "cause_effect",
            parts: [
              { text: "模糊输入", role: "cause" },
              { text: "无法定位", role: "process" },
              { text: "盲目换工具", role: "result" },
            ],
          },
        },
        {
          kind: "quote",
          at: 12,
          text: "保存对话不等于理解用户",
          visualPlan: {
            relation: "replacement",
            parts: [
              { text: "保存对话", role: "old" },
              { text: "理解用户", role: "new" },
            ],
          },
        },
      ],
    },
  ],
};

writeFileSync(
  output,
  generateVideoRenderHtml(props, {
    gsapSrc: new URL("../node_modules/gsap/dist/gsap.min.js", import.meta.url).href,
    mediaPrefix: "",
  }),
  "utf8",
);

console.log(output);
