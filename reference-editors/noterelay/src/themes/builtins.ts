import type { SocialTheme } from "../types";
import { NOTE_TO_RED_THEMES } from "../platforms/rednote/noteToRedThemes";

function wechatTheme(id: string, name: string, description: string, accent: string, background: string, text: string, muted: string, border: string): SocialTheme {
  return {
    id,
    name,
    description,
    platforms: ["wechat"],
    builtIn: true,
    tokens: {
      background,
      surface: "#ffffff",
      text,
      muted,
      accent,
      border,
      fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
      headingFontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
      baseFontSize: 15,
      lineHeight: 1.8,
      radius: 18,
      contentWidth: 677,
      cardRatio: "3:4",
      cardPadding: 32
    },
    customCss: ""
  };
}

export const BUILTIN_THEMES: SocialTheme[] = [
  wechatTheme("moyu-green", "摸鱼绿", "清爽绿色公众号主题，适合教程和知识分享。", "#059669", "#ffffff", "#334155", "#64748b", "#a7f3d0"),
  wechatTheme("red-white", "红白色系", "高识别度红白主题，适合观点和热点内容。", "#dc2626", "#ffffff", "#333333", "#737373", "#fecaca"),
  wechatTheme("graphite-minimal", "石墨极简风", "克制的黑白灰编辑风格，适合长文。", "#52525b", "#ffffff", "#52525b", "#a1a1aa", "#e4e4e7"),
  wechatTheme("zen-whitespace", "留白禅意风", "柔和低饱和、留白充足的阅读主题。", "#4a5d52", "#ffffff", "#4a4a44", "#8a8a82", "#b5c8bc"),
  wechatTheme("moyu-ticket", "摸鱼票据风", "带票据感和信息层级的绿色主题。", "#059669", "#ffffff", "#2f3a34", "#64748b", "#86efac"),
  wechatTheme("olive-journal", "橄榄手记", "暖纸张与橙色强调的手记风格。", "#ed7b2f", "#ffffff", "#3d3a34", "#83786a", "#d8cbb4"),
  {
    id: "toutiao-native",
    name: "头条号原生",
    description: "参考头条号官方编辑器的固定原生排版。",
    platforms: ["toutiao"],
    builtIn: true,
    tokens: {
      background: "#ffffff", surface: "#f7f8fa", text: "#222222", muted: "#666666",
      accent: "#406599", border: "#e5e6eb", fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
      headingFontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif", baseFontSize: 17,
      lineHeight: 1.75, radius: 0, contentWidth: 677, cardRatio: "3:4", cardPadding: 24
    },
    customCss: ""
  },
  ...NOTE_TO_RED_THEMES,
  {
    id: "x-clean",
    name: "X 极简",
    description: "用于 X 文案预览的高对比极简主题。",
    platforms: ["x"],
    builtIn: true,
    tokens: {
      background: "#000000", surface: "#16181c", text: "#e7e9ea", muted: "#71767b",
      accent: "#1d9bf0", border: "#2f3336", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      headingFontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", baseFontSize: 16,
      lineHeight: 1.5, radius: 16, contentWidth: 600, cardRatio: "3:4", cardPadding: 24
    },
    customCss: ""
  }
];
