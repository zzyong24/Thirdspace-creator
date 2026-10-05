import type { WechatFooterCardStyle } from "../../../types";
import type { BuiltInTheme } from "./types";

export interface ThemeInfo {
  id: string;
  label: string;
  accent: string;
  light: string;
  border: string;
  title: string;
  text: string;
  muted: string;
  highlight: string;
  deep: string;
  codeBg: string;
  signatureBg: string;
  underlineCss: string;
  maxWidth: number;
  layout: "magazine" | "red-editorial" | "graphite" | "zen" | "ticket" | "olive";
  fontFamily: string;
  footerCard?: WechatFooterCardStyle;
  css: string;
}

export const THEMES: ThemeInfo[] = [
  {
    id: "moyu-green",
    label: "摸鱼绿",
    accent: "#059669",
    light: "#ECFDF5",
    border: "#A7F3D0",
    title: "#064E3B",
    text: "#334155",
    muted: "#64748B",
    highlight: "#FEF3C7",
    deep: "#064E3B",
    codeBg: "#052E2B",
    signatureBg: "#F0FDF4",
    underlineCss: "border-bottom:2px solid #A7F3D0;font-weight:600;",
    maxWidth: 677,
    layout: "magazine",
    fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif",
    css: ""
  },
  {
    id: "red-white",
    label: "红白色系",
    accent: "#DC2626",
    light: "#FEF2F2",
    border: "#FECACA",
    title: "#7F1D1D",
    text: "#333333",
    muted: "#737373",
    highlight: "#FFE4E6",
    deep: "#991B1B",
    codeBg: "#1F1717",
    signatureBg: "#FFF7F7",
    underlineCss: "border-bottom:2px solid #FECACA;font-weight:600;",
    maxWidth: 677,
    layout: "red-editorial",
    fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif",
    css: ""
  },
  {
    id: "graphite-minimal",
    label: "石墨极简风",
    accent: "#52525B",
    light: "#FAFAFA",
    border: "#E4E4E7",
    title: "#27272A",
    text: "#52525B",
    muted: "#A1A1AA",
    highlight: "#F4F4F5",
    deep: "#27272A",
    codeBg: "#27272A",
    signatureBg: "#FFFFFF",
    underlineCss: "border-bottom:2px solid #52525B;font-weight:600;",
    maxWidth: 677,
    layout: "graphite",
    fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif",
    css: ""
  },
  {
    id: "zen-whitespace",
    label: "留白禅意风",
    accent: "#4A5D52",
    light: "#EEF3F0",
    border: "#B5C8BC",
    title: "#2B2B2B",
    text: "#525252",
    muted: "#A3A3A3",
    highlight: "#EEF3F0",
    deep: "#3D5046",
    codeBg: "#28342E",
    signatureBg: "#FAF9F4",
    underlineCss: "border-bottom:1.5px solid #B5C8BC;font-weight:500;",
    maxWidth: 677,
    layout: "zen",
    fontFamily: "'Songti SC','Noto Serif SC',Georgia,'Times New Roman',serif",
    css: ""
  },
  {
    id: "moyu-ticket",
    label: "摸鱼票据风",
    accent: "#059669",
    light: "#F0FDF4",
    border: "#A7F3D0",
    title: "#1A1A1A",
    text: "#1F2937",
    muted: "#64748B",
    highlight: "#DCFCE7",
    deep: "#065F46",
    codeBg: "#052E16",
    signatureBg: "#FFFEF8",
    underlineCss: "border-bottom:2px solid #A7F3D0;font-weight:600;",
    maxWidth: 677,
    layout: "ticket",
    fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
    css: ""
  },
  {
    id: "olive-journal",
    label: "橄榄手记",
    accent: "#ED7B2F",
    light: "#EEEFE9",
    border: "#BFC1B7",
    title: "#23251D",
    text: "#4D4F46",
    muted: "#9EA096",
    highlight: "#EEEFE9",
    deep: "#1E1F23",
    codeBg: "#202124",
    signatureBg: "#FDFDF8",
    underlineCss: "border-bottom:2px solid #ED7B2F;font-weight:600;",
    maxWidth: 677,
    layout: "olive",
    fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
    css: ""
  }
];

export function isBuiltInTheme(value: string | undefined): value is BuiltInTheme {
  return THEMES.some((theme) => theme.id === value);
}

export function getThemeInfo(theme: BuiltInTheme | undefined): ThemeInfo {
  const fallback = THEMES[0];
  if (!fallback) throw new Error("公众号主题列表不能为空");
  return THEMES.find((item) => item.id === theme) ?? fallback;
}

export function getThemeCss(_theme: BuiltInTheme | undefined): string {
  return "";
}
