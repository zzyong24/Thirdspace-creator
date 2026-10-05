export type PlatformId = "wechat" | "toutiao" | "rednote" | "x";

export interface SocialAccount {
  id: string;
  platform: PlatformId;
  name: string;
  handle: string;
  avatarUrl: string;
  signature: string;
  variables?: Record<string, string>;
  enabled: boolean;
}

export interface ThemeTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  fontFamily: string;
  headingFontFamily: string;
  baseFontSize: number;
  lineHeight: number;
  radius: number;
  contentWidth: number;
  cardRatio: "3:4";
  cardPadding: number;
  title?: string;
  code?: string;
  quoteBackground?: string;
  glow?: string;
}

export interface SocialTheme {
  id: string;
  name: string;
  description: string;
  platforms: PlatformId[];
  tokens: ThemeTokens;
  customCss: string;
  builtIn: boolean;
}

export type WechatBaseLayout = "magazine" | "red-editorial" | "graphite" | "zen" | "ticket" | "olive";
export type WechatFontPreset = "system" | "pingfang" | "microsoft-yahei" | "serif" | "kaiti" | "fangsong";

export interface WechatFooterCardStyle {
  background: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  iconBackground: string;
  activeIconBackground: string;
  borderRadius: number;
  iconRadius: number;
  shadow: "none" | "soft";
}

export interface CustomWechatTheme {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  baseLayout: WechatBaseLayout;
  industryTags: string[];
  sceneTags: string[];
  styleTags: string[];
  colors: {
    accent: string;
    light: string;
    border: string;
    title: string;
    text: string;
    muted: string;
    highlight: string;
    deep: string;
    codeBackground: string;
    signatureBackground: string;
  };
  typography: {
    fontPreset: WechatFontPreset;
    baseFontSize: number;
    lineHeight: number;
  };
  decoration: {
    underlineWidth: 1 | 2 | 3;
    underlineWeight: 500 | 600 | 700;
  };
  footer?: WechatFooterCardStyle;
  contentWidth: number;
}

export interface AccountPreferences {
  themeId?: string;
  rednoteTemplateId?: RednoteTemplateId;
  rednoteFontFamily?: string;
  rednoteFontSize?: number;
  rednoteBackgroundImage?: string;
  rednoteBackgroundScale?: number;
  rednoteBackgroundPosition?: { x: number; y: number };
}

export interface PluginSettings {
  accounts: SocialAccount[];
  enabledPlatforms: Record<PlatformId, boolean>;
  activeAccountIds: Partial<Record<PlatformId, string>>;
  activeThemeIds: Partial<Record<PlatformId, string>>;
  accountPreferences: Record<string, AccountPreferences>;
  customWechatThemes: unknown[];
  rednoteSplitHeading: 1 | 2;
  rednoteCopyScale: number;
  rednoteTemplateId: RednoteTemplateId;
  rednoteFontFamily: string;
  rednoteFontSize: number;
  rednoteBackgroundImage: string;
  rednoteBackgroundScale: number;
  rednoteBackgroundPosition: { x: number; y: number };
  rednoteImageWidths: Record<string, Record<string, number>>;
  rednoteImageRadii: Record<string, Record<string, number>>;
  xIncludeTitle: boolean;
}

export type RednoteTemplateId = "default" | "notes";

export interface ParsedNote {
  title: string;
  source: string;
  markdown: string;
  html: string;
  plainText: string;
}

export interface RenderContext {
  signal?: AbortSignal;
  nativeControls?: boolean;
  onDeliver?: (delivery: import("../web/host-port").Delivery) => void;
  onImageSelected?: (imageKey: string) => void;
  note: ParsedNote;
  account?: SocialAccount;
  theme: SocialTheme;
  settings: PluginSettings;
  notePath?: string;
  rednoteFocusImageKey?: string;
  onRednoteImageWidthChange?: (imageKey: string, width?: number) => Promise<void>;
  onRednoteImageRadiusChange?: (imageKey: string, radius: number) => Promise<void>;
  resolveImageSrc?: (src: string) => string;
  resolveImageDataUrl?: (src: string) => Promise<string | undefined>;
}
