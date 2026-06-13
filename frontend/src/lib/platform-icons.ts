export type PlatformId =
  | "youtube"
  | "bilibili"
  | "douyin"
  | "xiaohongshu"
  | "wechatVideo"
  | "x";

export interface PlatformIcon {
  readonly id: PlatformId | "unknown";
  readonly label: string;
  readonly glyph: string;
  readonly background: string;
  readonly foreground: string;
}

const white = "#ffffff";

export const platformIcons = Object.freeze({
  youtube: Object.freeze({
    id: "youtube",
    label: "YouTube",
    glyph: "YT",
    background: "#ff0033",
    foreground: white,
  }),
  bilibili: Object.freeze({
    id: "bilibili",
    label: "哔哩哔哩",
    glyph: "B",
    background: "#00aeec",
    foreground: white,
  }),
  douyin: Object.freeze({
    id: "douyin",
    label: "抖音",
    glyph: "抖",
    background: "#000000",
    foreground: white,
  }),
  xiaohongshu: Object.freeze({
    id: "xiaohongshu",
    label: "小红书",
    glyph: "小红书",
    background: "#ff2442",
    foreground: white,
  }),
  wechatVideo: Object.freeze({
    id: "wechatVideo",
    label: "微信视频号",
    glyph: "视频号",
    background: "#07c160",
    foreground: white,
  }),
  x: Object.freeze({
    id: "x",
    label: "X",
    glyph: "X",
    background: "#000000",
    foreground: white,
  }),
} satisfies Readonly<Record<PlatformId, PlatformIcon>>);

export const unknownPlatformIcon: Readonly<PlatformIcon> = Object.freeze({
  id: "unknown",
  label: "未知平台",
  glyph: "?",
  background: "#667085",
  foreground: white,
});

function isPlatformId(value: string): value is PlatformId {
  return Object.hasOwn(platformIcons, value);
}

export function getPlatformIcon(value: string): Readonly<PlatformIcon> {
  return isPlatformId(value) ? platformIcons[value] : unknownPlatformIcon;
}
