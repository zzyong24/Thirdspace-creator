import { BUILTIN_THEMES } from "./builtins";
import type { PlatformId, PluginSettings, SocialTheme } from "../types";
import { customWechatThemeToSocialTheme, validCustomWechatThemes } from "../platforms/wechat/customTheme";

export function listThemes(settings: PluginSettings, platform: PlatformId): SocialTheme[] {
  const builtIn = BUILTIN_THEMES.filter((theme) => theme.platforms.includes(platform));
  return platform === "wechat" ? [...builtIn, ...validCustomWechatThemes(settings.customWechatThemes).map(customWechatThemeToSocialTheme)] : builtIn;
}

export function resolveTheme(settings: PluginSettings, platform: PlatformId): SocialTheme {
  const themes = listThemes(settings, platform);
  const selected = settings.activeThemeIds[platform];
  const theme = themes.find((item) => item.id === selected) ?? themes[0];
  if (!theme) throw new Error(`No theme available for ${platform}`);
  return theme;
}
