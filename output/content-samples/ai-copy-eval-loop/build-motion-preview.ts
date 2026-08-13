/** 用 CreatorOS 当前 video.cards v3 渲染同题竖屏动效小样。 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateVideoRenderHtml } from "../../../backend/src/modules/execution/video-render/template";
import type { VideoRenderProps } from "@creatoros/contract";

const output = resolve(process.argv[2] ?? "./motion-preview-v3.html");
const landscape = process.argv[3] === "landscape";

const props: VideoRenderProps = {
  meta: { title: "提示词越写越长，文案为什么还是模板味？", brandLabel: "CreatorOS" },
  delivery: landscape
    ? { width: 1920, height: 1080, fps: 30 }
    : { width: 1080, height: 1920, fps: 30 },
  talkingHead: {
    file: "data:video/mp4;base64,",
    durationSec: 15,
    hasAudio: false,
  },
  captions: [
    { start: 0, end: 5, cn: "要求越来越多，文案却没有更好" },
    { start: 5, end: 10, cn: "冻结同一个选题和事实，只改一个变量" },
    { start: 10, end: 15, cn: "提示词，是一个可以被验证的假设" },
  ],
  broll: [],
  scenes: [
    {
      id: "copy-eval-loop",
      label: "内容 Loop",
      title: "提示词不是越长越好",
      startSec: 0,
      endSec: 15,
      role: "body",
      cards: [
        {
          kind: "list",
          at: 0,
          items: [
            { text: "把提示词从三行补到三页" },
            { text: "要求越来越多" },
            { text: "没有更好" },
          ],
          visualPlan: {
            relation: "cause_effect",
            parts: [
              { text: "把提示词从三行补到三页", role: "cause" },
              { text: "要求越来越多", role: "process" },
              { text: "没有更好", role: "result" },
            ],
          },
        },
        {
          kind: "list",
          at: 5,
          items: [
            { text: "冻结同一个选题和事实" },
            { text: "只改一个变量" },
            { text: "盲评" },
            { text: "留下赢家" },
          ],
          visualPlan: {
            relation: "sequence",
            parts: [
              { text: "冻结同一个选题和事实", role: "step" },
              { text: "只改一个变量", role: "step" },
              { text: "盲评", role: "step" },
              { text: "留下赢家", role: "step" },
            ],
          },
        },
        {
          kind: "quote",
          at: 10,
          text: "提示词才不是一份越来越长的说明书\n可以被验证、被淘汰、被升级的假设",
          visualPlan: {
            relation: "replacement",
            parts: [
              { text: "提示词才不是一份越来越长的说明书", role: "old" },
              { text: "可以被验证、被淘汰、被升级的假设", role: "new" },
            ],
          },
        },
      ],
    },
  ],
};

  const html = generateVideoRenderHtml(props, {
    gsapSrc: new URL("../../../backend/node_modules/gsap/dist/gsap.min.js", import.meta.url).href,
    mediaPrefix: "",
    visualOnly: true,
  })
  .replace(
    '<style>',
    '<style>@font-face{font-family:"PingFang SC";src:local("PingFang SC")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}',
  );

writeFileSync(output, html, "utf8");

console.log(output);
