/** 用 CreatorOS 当前 video.cards v2 渲染同题竖屏动效小样。 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateVideoRenderHtml } from "../../../backend/src/modules/execution/video-render/template";
import type { VideoRenderProps } from "@creatoros/contract";

const output = resolve(process.argv[2] ?? "./motion-preview.html");

const props: VideoRenderProps = {
  meta: { title: "提示词越写越长，文案为什么还是模板味？", brandLabel: "CreatorOS" },
  delivery: { width: 1080, height: 1920, fps: 30 },
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
  })
  // 这是无真人素材的动效专场小样，移除占位视频层，保留正式渲染器的卡片与时间线。
  .replace(/<video id="th"[^>]*><\/video>/, "")
  // 浏览器直接打开即可播放，方便用户无需渲染器验看三种内容关系。
  .replace(
    'window.__timelines["main"] = tl;',
    'window.__timelines["main"] = tl; const seek = Number(new URLSearchParams(location.search).get("t")); requestAnimationFrame(() => Number.isFinite(seek) && seek > 0 ? tl.seek(seek, false) : tl.play(0));',
  );

writeFileSync(output, html, "utf8");

console.log(output);
