import type { AssetType } from "@/types/domain";

// [T-055e SPEC §6.2 第一层] 倾倒场确定性归类(零成本,默认开):
//   - MIME/扩展名 → assetType(既有枚举 image/video/audio/subtitle/document);
//   - 文件名启发式 → 用途标签(落 taxonomy tags/entity_tags,不移动文件)。
// 规则表集中在此(可维护);AI 增强层(asset.classify capability)是 T-055h,
// 未配置时只跑本层 —— 诚实,不假装看懂了内容。

export interface ClassifiedFile {
  readonly assetType: AssetType;
  /** 用途标签(中文,与 SPEC §6.2 词表一致):封面/截图/录屏/实拍/B-roll。 */
  readonly tags: readonly string[];
}

/** MIME/扩展名 → assetType(与 D1 AssetUploadButton 同一映射,规则收口到这里)。 */
export function assetTypeFor(name: string, mime: string): AssetType {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/x-subrip" || /\.(srt|vtt|ass)$/i.test(name)) {
    return "subtitle";
  }
  return "document";
}

// 文件名启发式规则表(SPEC §6.2)。macOS 屏录默认名:「Screen Recording …」/「屏幕录制…」;
// macOS 截图默认名:「Screenshot …」/「截屏…」。B-roll 的时长规则(<30s)需要媒体元数据,
// 浏览器侧拿不到 → 只按显式命名打(诚实降级,不猜)。
const NAME_RULES: ReadonlyArray<{
  tag: string;
  appliesTo: AssetType;
  pattern: RegExp;
}> = [
  { tag: "封面", appliesTo: "image", pattern: /cover|封面|首图/i },
  { tag: "截图", appliesTo: "image", pattern: /screenshot|截屏|截图/i },
  {
    tag: "录屏",
    appliesTo: "video",
    pattern: /screen[ _-]?recording|录屏|屏幕录制|screenflow|screen studio/i,
  },
  { tag: "B-roll", appliesTo: "video", pattern: /b[ _-]?roll/i },
];

/** 确定性归类:assetType + 用途标签(video 无命中启发式 → 「实拍」兜底)。 */
export function classifyFile(name: string, mime: string): ClassifiedFile {
  const assetType = assetTypeFor(name, mime);
  const tags = NAME_RULES.filter(
    (r) => r.appliesTo === assetType && r.pattern.test(name),
  ).map((r) => r.tag);
  // SPEC §6.2:「实拍」= 视频且非录屏(显式规则没命中的视频默认实拍)。
  if (assetType === "video" && !tags.includes("录屏") && !tags.includes("B-roll")) {
    tags.push("实拍");
  }
  return { assetType, tags };
}
