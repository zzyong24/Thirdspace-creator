// SEMANTIC_BOUNDARY_ALLOW: 比例用途仅为固定展示文案，不判断内容、不选择平台或创作方案。
const usageLabels: Record<string, string> = {
  "1:1": "公众号次条 · 方形封面",
  "3:4": "小红书 · 竖版封面",
  "16:9": "B站 · 横版视频",
  "9:16": "抖音 · 全屏竖版",
  "2:3": "竖版海报",
  "3:2": "横版照片",
  "4:3": "横版图文",
  "4:5": "竖版图文",
  "5:4": "横版海报",
  "21:9": "公众号头图底稿",
};

export function coverAspectRatioUsage(ratio: string): string {
  return usageLabels[ratio] ?? "自定义画幅";
}

export function coverAspectRatioLabel(ratio: string): string {
  return `${ratio} · ${coverAspectRatioUsage(ratio)}`;
}
