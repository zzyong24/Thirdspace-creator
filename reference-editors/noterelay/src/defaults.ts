import type { PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  accounts: [],
  enabledPlatforms: {
    wechat: true,
    toutiao: true,
    rednote: true,
    x: true
  },
  activeAccountIds: {},
  activeThemeIds: {
    wechat: "moyu-green",
    toutiao: "toutiao-native",
    rednote: "default",
    x: "x-clean"
  },
  accountPreferences: {},
  customWechatThemes: [],
  rednoteSplitHeading: 2,
  rednoteCopyScale: 2,
  rednoteTemplateId: "default",
  rednoteFontFamily: "Optima-Regular,Optima,PingFangSC-light,PingFangTC-light,'PingFang SC',serif",
  rednoteFontSize: 16,
  rednoteBackgroundImage: "",
  rednoteBackgroundScale: 1,
  rednoteBackgroundPosition: { x: 0, y: 0 },
  rednoteImageWidths: {},
  rednoteImageRadii: {},
  xIncludeTitle: true
};
