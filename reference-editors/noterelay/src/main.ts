import { Plugin, type WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS } from "./defaults";
import type { PluginSettings } from "./types";
import { NoteRelaySettingTab } from "./ui/settingsTab";
import { NOTERELAY_VIEW, NoteRelayView } from "./ui/noteRelayView";
import { openPluginSettings } from "./ui/openSettings";

export default class NoteRelayPlugin extends Plugin {
  settings: PluginSettings = structuredClone(DEFAULT_SETTINGS);
  settingTab!: NoteRelaySettingTab;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(NOTERELAY_VIEW, (leaf) => new NoteRelayView(leaf, this));
    this.settingTab = new NoteRelaySettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    this.addRibbonIcon("send", "打开 NoteRelay", () => void this.activateView());
    this.addCommand({ id: "open-preview", name: "打开多平台排版预览", callback: () => void this.activateView() });
    this.addCommand({ id: "open-settings", name: "打开账号与排版设置", callback: () => {
      openPluginSettings(this.app, this.manifest.id);
    } });
  }

  async activateView(): Promise<void> {
    let leaf: WorkspaceLeaf | undefined = this.app.workspace.getLeavesOfType(NOTERELAY_VIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
      await leaf?.setViewState({ type: NOTERELAY_VIEW, active: true });
    }
    if (leaf) await this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(stored ?? {}) };
    this.settings.enabledPlatforms = {
      ...DEFAULT_SETTINGS.enabledPlatforms,
      ...(stored?.enabledPlatforms ?? {})
    };
    if (!Object.values(this.settings.enabledPlatforms).some(Boolean)) {
      this.settings.enabledPlatforms.wechat = true;
      await this.saveSettings();
    }
    if (!this.settings.accountPreferences || typeof this.settings.accountPreferences !== "object") {
      this.settings.accountPreferences = {};
      await this.saveSettings();
    }
    if (!Array.isArray(this.settings.customWechatThemes)) {
      this.settings.customWechatThemes = [];
      await this.saveSettings();
    }
    if (this.settings.activeThemeIds.wechat === "clean-editorial") {
      this.settings.activeThemeIds.wechat = "moyu-green";
      await this.saveSettings();
    }
    if (this.settings.activeThemeIds.toutiao !== "toutiao-native") {
      this.settings.activeThemeIds.toutiao = "toutiao-native";
      await this.saveSettings();
    }
    if (["warm-card", "rednote-clean", "mint-note", "graphite-card", "lemon-pop", "lavender-soft"].includes(this.settings.activeThemeIds.rednote ?? "")) {
      this.settings.activeThemeIds.rednote = "default";
      await this.saveSettings();
    }
    if (!["default", "notes"].includes(this.settings.rednoteTemplateId)) {
      this.settings.rednoteTemplateId = "default";
      await this.saveSettings();
    }
    if (this.settings.rednoteSplitHeading !== 1 && this.settings.rednoteSplitHeading !== 2) {
      this.settings.rednoteSplitHeading = 2;
      await this.saveSettings();
    }
    if (!this.settings.rednoteImageWidths || typeof this.settings.rednoteImageWidths !== "object") {
      this.settings.rednoteImageWidths = {};
      await this.saveSettings();
    }
    if (!this.settings.rednoteImageRadii || typeof this.settings.rednoteImageRadii !== "object") {
      this.settings.rednoteImageRadii = {};
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.app.workspace.getLeavesOfType(NOTERELAY_VIEW).forEach((leaf) => {
      if (leaf.view instanceof NoteRelayView) leaf.view.render();
    });
  }
}
