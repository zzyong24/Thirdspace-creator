import type { RednoteTemplateId } from "../../types";

export const REDNOTE_TEMPLATES: Array<{ id: RednoteTemplateId; name: string }> = [
  { id: "default", name: "默认模板" },
  { id: "notes", name: "备忘录" }
];

export const REDNOTE_FONTS = [
  { name: "默认字体", value: "Optima-Regular,Optima,PingFangSC-light,PingFangTC-light,'PingFang SC',serif" },
  { name: "宋体", value: "SimSun,'Songti SC',serif" },
  { name: "黑体", value: "SimHei,'PingFang SC',sans-serif" },
  { name: "楷体", value: "KaiTi,'Kaiti SC',serif" },
  { name: "微软雅黑", value: "'Microsoft YaHei','微软雅黑',sans-serif" }
];

export const REDNOTE_BACKGROUNDS = [
  { id: "", name: "跟随主题", image: "" },
  { id: "paper-grid", name: "内置背景 1 · 方格纸", image: svgBackground("#f7f1e8", "#ded2c2", "grid") },
  { id: "pink-wave", name: "内置背景 2 · 粉色流光", image: svgBackground("#fde8ee", "#f4a8bd", "wave") },
  { id: "blue-paper", name: "内置背景 3 · 蓝色纸张", image: svgBackground("#e9f2f8", "#a9c9dc", "dots") },
  { id: "green-leaf", name: "内置背景 4 · 森林浅影", image: svgBackground("#e7f1e9", "#94b69c", "leaf") },
  { id: "purple-night", name: "内置背景 5 · 紫色星空", image: svgBackground("#242238", "#8e7cc3", "stars") },
  { id: "warm-sun", name: "内置背景 6 · 暖阳渐变", image: svgBackground("#fff0cf", "#dc9f55", "sun") }
] as const;

export const REDNOTE_IMAGE_SIZE = { id: "1242x1660", name: "3:4 高清（1242×1660）", width: 1242, height: 1660 } as const;

function svgBackground(background: string, accent: string, pattern: string): string {
  const patternMarkup = pattern === "grid" ? `<path d="M0 40H800M0 80H800M40 0V800M80 0V800" stroke="${accent}" opacity=".35"/>` : pattern === "dots" ? `<g fill="${accent}" opacity=".4"><circle cx="30" cy="30" r="3"/><circle cx="90" cy="90" r="3"/></g>` : pattern === "stars" ? `<g fill="${accent}" opacity=".65"><circle cx="70" cy="65" r="2"/><circle cx="180" cy="140" r="3"/><circle cx="310" cy="60" r="2"/></g>` : pattern === "leaf" ? `<path d="M40 120C100 20 190 40 220 100C150 130 90 160 40 120ZM580 670C640 570 730 590 760 650C690 680 630 710 580 670Z" fill="${accent}" opacity=".25"/>` : pattern === "sun" ? `<circle cx="650" cy="120" r="180" fill="${accent}" opacity=".25"/><circle cx="80" cy="700" r="230" fill="${accent}" opacity=".15"/>` : `<path d="M-20 180C180 40 340 300 820 80V240C380 460 180 180-20 340Z" fill="${accent}" opacity=".25"/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="${background}"/>${patternMarkup}</svg>`)}`;
}
