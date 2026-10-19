import type { ThemeInfo } from "./themeCss";

export type BuiltInTheme = "moyu-green" | "red-white" | "graphite-minimal" | "zen-whitespace" | "moyu-ticket" | "olive-journal";

export interface CustomCssPreset {
  id: string;
  name: string;
  css: string;
}

export interface WeChatLayoutSettings {
  defaultTheme: BuiltInTheme;
  accentColor: string;
  contentWidth: number;
  showCopyWarnings: boolean;
  customCss: string;
  useCustomCss: boolean;
  safeMode: boolean;
  lastPreviewTheme: BuiltInTheme;
  customCssPresets: CustomCssPreset[];
  activeCssPresetId: string;
  authorName: string;
  authorBio: string;
  footerCta: string;
  articleVariables: string;
  autoSignature: boolean;
  autoKeywordUnderline: boolean;
}

export interface RenderOptions extends WeChatLayoutSettings {
  resolveImageSrc?: (src: string) => string;
  themeOverride?: BuiltInTheme;
  themeInfoOverride?: ThemeInfo;
  bodyFontSize?: number;
  bodyLineHeight?: number;
  customCss: string;
  useCustomCss: boolean;
  safeMode: boolean;
  inlineComputedCss?: boolean;
}

export interface RenderResult {
  html: string;
  plainText: string;
  warnings: string[];
}

export interface Frontmatter {
  title?: string;
  subtitle?: string;
  kicker?: string;
  theme?: BuiltInTheme;
  accent?: string;
  author?: string;
  bio?: string;
  [key: string]: string | undefined;
}

export type ParsedBlock =
  | { type: "heading"; level: number; text: string; html?: string }
  | { type: "paragraph"; text: string; html?: string }
  | { type: "list"; ordered: boolean; items: Array<{ text: string; html?: string; checked?: boolean }> }
  | { type: "quote"; text: string; html?: string }
  | { type: "code"; language: string; code: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "table"; headers: string[]; rows: string[][]; headerHtml?: string[]; rowsHtml?: string[][] }
  | { type: "rule" }
  | { type: "callout"; kind: string; title?: string; attrs: Record<string, string>; body: string; bodyHtml?: string };
