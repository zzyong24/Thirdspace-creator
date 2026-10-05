import type { AccountPreferences, PlatformId, PluginSettings, SocialAccount } from "../types";

export function resolveSelectedAccount(settings: PluginSettings, platform: PlatformId, accounts: SocialAccount[]): SocialAccount | undefined {
  const selectedId = settings.activeAccountIds[platform];
  if (selectedId === "") return undefined;
  return accounts.find((account) => account.id === selectedId) ?? accounts[0];
}

export function settingsForAccount(settings: PluginSettings, account?: SocialAccount): PluginSettings {
  if (!account) return settings;
  const preferences = settings.accountPreferences[account.id];
  if (!preferences) return settings;
  return {
    ...settings,
    activeThemeIds: preferences.themeId
      ? { ...settings.activeThemeIds, [account.platform]: preferences.themeId }
      : settings.activeThemeIds,
    rednoteTemplateId: preferences.rednoteTemplateId ?? settings.rednoteTemplateId,
    rednoteFontFamily: preferences.rednoteFontFamily ?? settings.rednoteFontFamily,
    rednoteFontSize: preferences.rednoteFontSize ?? settings.rednoteFontSize,
    rednoteBackgroundImage: preferences.rednoteBackgroundImage ?? settings.rednoteBackgroundImage,
    rednoteBackgroundScale: preferences.rednoteBackgroundScale ?? settings.rednoteBackgroundScale,
    rednoteBackgroundPosition: preferences.rednoteBackgroundPosition
      ? { ...preferences.rednoteBackgroundPosition }
      : settings.rednoteBackgroundPosition
  };
}

export function rememberAccountPreferences(settings: PluginSettings, account: SocialAccount | undefined, patch: AccountPreferences): void {
  if (!account || (account.platform !== "wechat" && account.platform !== "rednote")) return;
  const baseline: AccountPreferences = account.platform === "rednote"
    ? {
      themeId: settings.activeThemeIds.rednote,
      rednoteTemplateId: settings.rednoteTemplateId,
      rednoteFontFamily: settings.rednoteFontFamily,
      rednoteFontSize: settings.rednoteFontSize,
      rednoteBackgroundImage: settings.rednoteBackgroundImage,
      rednoteBackgroundScale: settings.rednoteBackgroundScale,
      rednoteBackgroundPosition: { ...settings.rednoteBackgroundPosition }
    }
    : { themeId: settings.activeThemeIds.wechat };
  settings.accountPreferences[account.id] = {
    ...baseline,
    ...settings.accountPreferences[account.id],
    ...patch
  };
}
