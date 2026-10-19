import type { SocialTheme } from "../../types";

interface UpstreamPalette {
  id: string; name: string; background: string; surface: string; text: string;
  muted: string; accent: string; border: string; title: string; code: string;
  quoteBackground?: string; glow?: string;
}

const UPSTREAM_PRESETS: UpstreamPalette[] = [
  { id: "default", name: "默认主题", background: "#1c1c1e", surface: "#2c2c2e", text: "#f2f2f7", muted: "#98989d", accent: "#0A84FF", border: "#2c2c2e", title: "#f2f2f7", code: "#2c2c2e" },
  { id: "minimal", name: "极简主题", background: "#ffffff", surface: "#f5f5f5", text: "#444444", muted: "#999999", accent: "#6c9eb8", border: "#eeeeee", title: "#333333", code: "#f5f5f5" },
  { id: "warm", name: "暖阳文艺", background: "#fffaf5", surface: "#fff6e9", text: "#5a4a42", muted: "#b87333", accent: "#d2691e", border: "#deb887", title: "#8b4513", code: "#fff6e9", quoteBackground: "rgba(222,184,135,.1)" },
  { id: "elegant", name: "优雅暗色", background: "#1a1721", surface: "#2a2433", text: "#c4b8dd", muted: "#a393c9", accent: "#b490ff", border: "#3a3443", title: "#e2d9f3", code: "#2a2433", quoteBackground: "rgba(180,144,255,.05)" },
  { id: "forest", name: "森林清晨", background: "#17231e", surface: "#243830", text: "#f1fff6", muted: "#9adbb5", accent: "#68e6a0", border: "#4ba978", title: "#b9f6d0", code: "#243830", quoteBackground: "rgba(46,204,113,.09)" },
  { id: "ocean", name: "深海之境", background: "#0a192f", surface: "#112a45", text: "#e6f7ff", muted: "#69c0ff", accent: "#40a9ff", border: "#1d3552", title: "#40a9ff", code: "#112a45", quoteBackground: "rgba(64,169,255,.05)" },
  { id: "sakura", name: "樱花飞舞", background: "#1f1a1d", surface: "#2d2428", text: "#fff5f7", muted: "#ff8da1", accent: "#ff69b4", border: "#ffb6c180", title: "#ffb6c1", code: "#2d2428", quoteBackground: "rgba(255,141,161,.05)" },
  { id: "starry", name: "星空梦境", background: "#0d0f1a", surface: "#252640", text: "#f0e6ff", muted: "#b19cd9", accent: "#9b59b6", border: "#9370db80", title: "#9370db", code: "#252640", quoteBackground: "rgba(177,156,217,.05)" },
  { id: "metal", name: "金属科技", background: "#1e2228", surface: "#282c34", text: "#e0e0e0", muted: "#a0a0a0", accent: "#4d8ee7", border: "#4d4d4d80", title: "#f0f0f0", code: "#282c34", quoteBackground: "linear-gradient(to right,rgba(77,142,231,.1),transparent)" },
  { id: "cyber", name: "赛博朋克", background: "#ffffff", surface: "#f8f8f8", text: "#333333", muted: "#666666", accent: "#ff00ff", border: "rgba(0,255,255,.2)", title: "#ff00ff", code: "#f8f8f8", quoteBackground: "#f8f8f8", glow: "0 0 15px rgba(255,0,255,.1)" },
  { id: "yueling", name: "悦灵雅棕", background: "#1c1c1e", surface: "#2c2c2e", text: "#ffffff", muted: "#98989d", accent: "#c57512", border: "#2c2c2e", title: "#f2f2f7", code: "#2c2c2e" }
];

export const NOTE_TO_RED_THEMES: SocialTheme[] = UPSTREAM_PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  description: `移植自 Note to RED 的「${preset.name}」预设。`,
  platforms: ["rednote"],
  builtIn: true,
  tokens: {
    background: preset.background, surface: preset.surface, text: preset.text, muted: preset.muted,
    accent: preset.accent, border: preset.border,
    fontFamily: "Optima-Regular,Optima,PingFangSC-light,PingFangTC-light,'PingFang SC',serif",
    headingFontFamily: "Optima-Regular,Optima,PingFangSC-light,PingFangTC-light,'PingFang SC',serif",
    baseFontSize: 16, lineHeight: 1.8, radius: 8, contentWidth: 828, cardRatio: "3:4", cardPadding: 44,
    title: preset.title, code: preset.code, quoteBackground: preset.quoteBackground, glow: preset.glow
  },
  customCss: ""
}));
