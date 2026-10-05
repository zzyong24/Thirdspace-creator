import type { CustomWechatTheme, PluginSettings, SocialTheme, WechatBaseLayout, WechatFontPreset, WechatFooterCardStyle } from "../../types";
import { getThemeInfo, type ThemeInfo } from "./wenote/themeCss";

const BASE_LAYOUTS: readonly WechatBaseLayout[] = ["magazine", "red-editorial", "graphite", "zen", "ticket", "olive"];
const FONT_PRESETS: readonly WechatFontPreset[] = ["system", "pingfang", "microsoft-yahei", "serif", "kaiti", "fangsong"];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const CUSTOM_ID = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const DEFAULT_CUSTOM_WECHAT_FOOTER: WechatFooterCardStyle = {
  background: "#F8FAFC",
  borderColor: "#E2E8F0",
  textColor: "#0F172A",
  mutedColor: "#94A3B8",
  iconBackground: "#FFFFFF",
  activeIconBackground: "#ECFDF5",
  borderRadius: 16,
  iconRadius: 12,
  shadow: "soft"
};

export const CUSTOM_WECHAT_THEME_EXAMPLE: CustomWechatTheme = {
  schemaVersion: 1,
  id: "custom-tech-blue",
  name: "科技蓝",
  description: "适合 AI 教程和产品分析的理性科技风。",
  baseLayout: "graphite",
  industryTags: ["科技", "AI"],
  sceneTags: ["教程", "产品分析"],
  styleTags: ["理性", "高信息密度"],
  colors: {
    accent: "#2563EB", light: "#EFF6FF", border: "#BFDBFE", title: "#172554", text: "#334155",
    muted: "#64748B", highlight: "#DBEAFE", deep: "#1E3A8A", codeBackground: "#0F172A", signatureBackground: "#F8FAFC"
  },
  typography: { fontPreset: "system", baseFontSize: 15, lineHeight: 1.85 },
  decoration: { underlineWidth: 2, underlineWeight: 600 },
  footer: { ...DEFAULT_CUSTOM_WECHAT_FOOTER },
  contentWidth: 677
};

export function customWechatThemePrompt(): string {
  const example = JSON.stringify(CUSTOM_WECHAT_THEME_EXAMPLE, null, 2);
  return `你是 NoteRelay 的微信公众号主题配置生成器。请根据【我的主题要求】生成一份主题配置。\n\n【目标】\n配置会由 NoteRelay 转成微信公众号兼容的内联样式。你只能调整颜色、字体、阅读节奏和已验证的基础布局；不能输出 HTML、CSS、JavaScript、图片 URL 或外部字体。\n\n【带注释 JSONC 规范模板：仅用于理解，最终不要保留注释】\n{\n  // 固定为 1\n  "schemaVersion": 1,\n  // 唯一 ID，必须以 custom- 开头，只能用小写字母、数字和连字符\n  "id": "custom-tech-blue",\n  // 主题名称、说明\n  "name": "科技蓝",\n  "description": "适合 AI 教程和产品分析的理性科技风。",\n  // 只能是 magazine、red-editorial、graphite、zen、ticket、olive\n  "baseLayout": "graphite",\n  // 用于管理和推荐的标签，每项 2–20 个字符，每组 0–4 项\n  "industryTags": ["科技", "AI"],\n  "sceneTags": ["教程", "产品分析"],\n  "styleTags": ["理性", "高信息密度"],\n  // 每个颜色必须为 #RRGGBB\n  "colors": { "accent": "#2563EB", "light": "#EFF6FF", "border": "#BFDBFE", "title": "#172554", "text": "#334155", "muted": "#64748B", "highlight": "#DBEAFE", "deep": "#1E3A8A", "codeBackground": "#0F172A", "signatureBackground": "#F8FAFC" },\n  // fontPreset 只能是 system、pingfang、microsoft-yahei、serif、kaiti、fangsong；字号 14–18，行距 1.5–2.2\n  "typography": { "fontPreset": "system", "baseFontSize": 15, "lineHeight": 1.85 },\n  // 下划线宽度只能是 1、2、3；字重只能是 500、600、700\n  "decoration": { "underlineWidth": 2, "underlineWeight": 600 },\n  // 固定渲染点赞、在看、转发互动卡；这里只控制安全视觉参数。颜色必须为 #RRGGBB，圆角为 0–32，shadow 只能是 none 或 soft\n  "footer": { "background": "#F8FAFC", "borderColor": "#E2E8F0", "textColor": "#0F172A", "mutedColor": "#94A3B8", "iconBackground": "#FFFFFF", "activeIconBackground": "#ECFDF5", "borderRadius": 16, "iconRadius": 12, "shadow": "soft" },\n  // 正文宽度 600–720\n  "contentWidth": 677\n}\n\n【标准 JSON 输出示例】\n${example}\n\n【最终输出要求】\n1. 只输出一份可被 JSON.parse 读取的标准 JSON。\n2. 不要输出注释、Markdown 代码围栏、解释或额外字段。\n3. 所有颜色都必须为 #RRGGBB；不得使用渐变、透明色、CSS 变量或外部资源。\n4. footer 只控制底部互动卡的颜色、圆角和阴影；不得改变结构、图标、文案或增删按钮。\n5. 保持正文高对比、近白背景和适合长文阅读的公众号排版。\n\n【我的主题要求】\n请在这里填写行业、颜色、审美、内容场景和希望参考的基础布局：`;
}

export function parseCustomWechatTheme(input: string): { theme?: CustomWechatTheme; errors: string[] } {
  if (input.length > 32_000) return { errors: ["配置不能超过 32KB"] };
  let value: unknown;
  try { value = JSON.parse(input); } catch { return { errors: ["配置必须是标准 JSON；请删除注释、代码围栏和说明文字"] }; }
  const errors = validateTheme(value);
  return errors.length ? { errors } : { theme: normalizeTheme(value as CustomWechatTheme), errors: [] };
}

export function parseStoredCustomWechatTheme(value: unknown): { theme?: CustomWechatTheme; errors: string[] } {
  try {
    const serialized = JSON.stringify(value);
    return serialized ? parseCustomWechatTheme(serialized) : { errors: ["配置不是可保存的 JSON 数据"] };
  } catch {
    return { errors: ["配置不是可保存的 JSON 数据"] };
  }
}

export function validCustomWechatThemes(values: readonly unknown[]): CustomWechatTheme[] {
  return values.flatMap((value) => {
    const result = parseStoredCustomWechatTheme(value);
    return result.theme ? [result.theme] : [];
  });
}

export function customWechatThemeToSocialTheme(theme: CustomWechatTheme): SocialTheme {
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    platforms: ["wechat"],
    builtIn: false,
    customCss: "",
    tokens: {
      background: "#FFFFFF", surface: theme.colors.light, text: theme.colors.text, muted: theme.colors.muted,
      accent: theme.colors.accent, border: theme.colors.border, fontFamily: fontFamily(theme.typography.fontPreset),
      headingFontFamily: fontFamily(theme.typography.fontPreset), baseFontSize: theme.typography.baseFontSize,
      lineHeight: theme.typography.lineHeight, radius: resolveFooter(theme).borderRadius, contentWidth: theme.contentWidth, cardRatio: "3:4", cardPadding: 32,
      title: theme.colors.title, code: theme.colors.codeBackground, quoteBackground: theme.colors.light
    }
  };
}

export function customWechatThemeInfo(theme: CustomWechatTheme): ThemeInfo {
  const base = getThemeInfo(baseThemeId(theme.baseLayout));
  return {
    ...base,
    id: theme.id,
    label: theme.name,
    accent: theme.colors.accent,
    light: theme.colors.light,
    border: theme.colors.border,
    title: theme.colors.title,
    text: theme.colors.text,
    muted: theme.colors.muted,
    highlight: theme.colors.highlight,
    deep: theme.colors.deep,
    codeBg: theme.colors.codeBackground,
    signatureBg: theme.colors.signatureBackground,
    footerCard: resolveFooter(theme),
    underlineCss: `border-bottom:${theme.decoration.underlineWidth}px solid ${theme.colors.border};font-weight:${theme.decoration.underlineWeight};`,
    maxWidth: theme.contentWidth,
    fontFamily: fontFamily(theme.typography.fontPreset)
  };
}

export function findCustomWechatTheme(settings: PluginSettings, id: string): CustomWechatTheme | undefined {
  return validCustomWechatThemes(settings.customWechatThemes).find((theme) => theme.id === id);
}

export function baseThemeId(layout: WechatBaseLayout): "moyu-green" | "red-white" | "graphite-minimal" | "zen-whitespace" | "moyu-ticket" | "olive-journal" {
  const ids: Record<WechatBaseLayout, "moyu-green" | "red-white" | "graphite-minimal" | "zen-whitespace" | "moyu-ticket" | "olive-journal"> = {
    magazine: "moyu-green", "red-editorial": "red-white", graphite: "graphite-minimal", zen: "zen-whitespace", ticket: "moyu-ticket", olive: "olive-journal"
  };
  return ids[layout];
}

function validateTheme(value: unknown): string[] {
  if (!isRecord(value)) return ["根节点必须是对象"];
  const allowed = ["schemaVersion", "id", "name", "description", "baseLayout", "industryTags", "sceneTags", "styleTags", "colors", "typography", "decoration", "footer", "contentWidth"];
  const errors = Object.keys(value).filter((key) => !allowed.includes(key)).map((key) => `不支持字段：${key}`);
  if (value.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (typeof value.id !== "string" || !CUSTOM_ID.test(value.id)) errors.push("id 必须以 custom- 开头，并只包含小写字母、数字和连字符");
  if (!shortText(value.name, 2, 30)) errors.push("name 长度必须为 2–30 个字符");
  if (!shortText(value.description, 4, 120)) errors.push("description 长度必须为 4–120 个字符");
  if (typeof value.baseLayout !== "string" || !BASE_LAYOUTS.includes(value.baseLayout as WechatBaseLayout)) errors.push("baseLayout 不在允许范围内");
  for (const key of ["industryTags", "sceneTags", "styleTags"] as const) if (!tags(value[key])) errors.push(`${key} 必须是 0–4 个 2–20 字符的标签`);
  const colorKeys = ["accent", "light", "border", "title", "text", "muted", "highlight", "deep", "codeBackground", "signatureBackground"];
  const colors = value.colors;
  if (!isRecord(colors)) errors.push("colors 必须是对象");
  else {
    if (!hasOnlyKeys(colors, colorKeys) || colorKeys.some((key) => typeof colors[key] !== "string" || !HEX_COLOR.test(colors[key]))) errors.push("colors 必须完整包含 10 个 #RRGGBB 颜色字段");
  }
  const typography = value.typography;
  if (!isRecord(typography) || !hasOnlyKeys(typography, ["fontPreset", "baseFontSize", "lineHeight"]) || !FONT_PRESETS.includes(typography.fontPreset as WechatFontPreset) || !inRange(typography.baseFontSize, 14, 18) || !inRange(typography.lineHeight, 1.5, 2.2)) errors.push("typography 的字体、字号或行距不符合规范");
  const decoration = value.decoration;
  if (!isRecord(decoration) || !hasOnlyKeys(decoration, ["underlineWidth", "underlineWeight"]) || ![1, 2, 3].includes(decoration.underlineWidth as number) || ![500, 600, 700].includes(decoration.underlineWeight as number)) errors.push("decoration 的下划线配置不符合规范");
  const footer = value.footer;
  const footerColorKeys = ["background", "borderColor", "textColor", "mutedColor", "iconBackground", "activeIconBackground"];
  const footerKeys = [...footerColorKeys, "borderRadius", "iconRadius", "shadow"];
  if (footer !== undefined && (!isRecord(footer) || !hasOnlyKeys(footer, footerKeys) || footerColorKeys.some((key) => typeof footer[key] !== "string" || !HEX_COLOR.test(footer[key])) || !inRange(footer.borderRadius, 0, 32) || !inRange(footer.iconRadius, 0, 32) || !["none", "soft"].includes(footer.shadow as string))) errors.push("footer 的颜色、圆角或阴影配置不符合规范");
  if (!inRange(value.contentWidth, 600, 720)) errors.push("contentWidth 必须在 600–720 之间");
  return errors;
}

function normalizeTheme(theme: CustomWechatTheme): CustomWechatTheme { return { ...theme, footer: resolveFooter(theme) }; }
function resolveFooter(theme: CustomWechatTheme): WechatFooterCardStyle { return { ...DEFAULT_CUSTOM_WECHAT_FOOTER, ...(theme.footer ?? {}) }; }

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function shortText(value: unknown, min: number, max: number): boolean { return typeof value === "string" && value.trim().length >= min && value.trim().length <= max; }
function tags(value: unknown): boolean { return Array.isArray(value) && value.length <= 4 && value.every((item) => shortText(item, 2, 20)); }
function inRange(value: unknown, min: number, max: number): boolean { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
function fontFamily(preset: WechatFontPreset): string {
  return ({ system: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif", pingfang: "'PingFang SC','Hiragino Sans GB',sans-serif", "microsoft-yahei": "'Microsoft YaHei',sans-serif", serif: "'Songti SC','Noto Serif SC',Georgia,serif", kaiti: "STKaiti,KaiTi,serif", fangsong: "STFangsong,FangSong,serif" })[preset];
}
