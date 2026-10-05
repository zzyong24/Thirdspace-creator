import { App, Modal, Notice, Setting } from "obsidian";
import type NoteRelayPlugin from "../main";
import { CUSTOM_WECHAT_THEME_EXAMPLE, customWechatThemePrompt, parseCustomWechatTheme, parseStoredCustomWechatTheme } from "../platforms/wechat/customTheme";

export class CustomWechatThemesModal extends Modal {
  private editor?: HTMLTextAreaElement;
  private validation?: HTMLElement;
  private editingStoredIndex?: number;

  constructor(app: App, private readonly plugin: NoteRelayPlugin, private readonly onSaved: () => void) {
    super(app);
  }

  onOpen(): void {
    this.editingStoredIndex = undefined;
    this.contentEl.empty();
    this.modalEl.addClass("noterelay-custom-theme-modal-shell");
    this.contentEl.addClass("noterelay-custom-theme-modal");
    this.contentEl.createEl("h2", { text: "公众号自定义主题" });
    this.contentEl.createEl("p", { text: "先复制标准提示词交给 AI，再把 AI 返回的纯 JSON 粘贴到这里。NoteRelay 会校验配置，并用公众号兼容的内联样式渲染。" });

    const promptSetting = new Setting(this.contentEl)
      .setName("AI 主题生成提示词")
      .setDesc("提示词包含带注释的模板、全部枚举和最终输出规则。");
    promptSetting.settingEl.addClass("noterelay-custom-theme-setting");
    promptSetting.addButton((button) => button.setButtonText("复制提示词").setCta().onClick(() => void this.copyPrompt()));

    this.editor = this.contentEl.createEl("textarea", {
      cls: "noterelay-custom-theme-editor",
      attr: { "aria-label": "公众号自定义主题 JSON", placeholder: "粘贴 AI 返回的纯 JSON 配置…", spellcheck: "false" }
    });
    this.editor.value = "";
    this.validation = this.contentEl.createDiv({ cls: "noterelay-custom-theme-validation", text: "提示：JSON 内不能包含注释、代码围栏或说明文字。" });

    const actionsSetting = new Setting(this.contentEl);
    actionsSetting.settingEl.addClass("noterelay-custom-theme-actions");
    actionsSetting
      .addButton((button) => button.setButtonText("填入示例").onClick(() => {
        this.editingStoredIndex = undefined;
        if (this.editor) this.editor.value = JSON.stringify(CUSTOM_WECHAT_THEME_EXAMPLE, null, 2);
        this.validate();
      }))
      .addButton((button) => button.setButtonText("校验配置").onClick(() => this.validate()))
      .addButton((button) => button.setButtonText("保存主题").setCta().onClick(() => void this.save()));

    const saved = this.contentEl.createDiv({ cls: "noterelay-custom-theme-saved" });
    saved.createEl("h3", { text: "已保存主题" });
    if (!this.plugin.settings.customWechatThemes.length) saved.createEl("p", { text: "尚未保存自定义主题。" });
    const invalidCount = this.plugin.settings.customWechatThemes.filter((value) => !parseStoredCustomWechatTheme(value).theme).length;
    if (invalidCount) saved.createEl("p", { cls: "noterelay-custom-theme-validation is-error", text: `发现 ${invalidCount} 条不可用配置。原始 JSON 已保留且不会参与渲染，可载入修复或手动删除。` });
    this.plugin.settings.customWechatThemes.forEach((storedTheme, index) => {
      const parsed = parseStoredCustomWechatTheme(storedTheme);
      const theme = parsed.theme;
      if (!theme) {
        const invalidSetting = new Setting(saved)
          .setName(`不可用配置 #${index + 1}`)
          .setDesc(parsed.errors.join("；"));
        invalidSetting.settingEl.addClass("noterelay-custom-theme-saved-item");
        invalidSetting
          .addButton((button) => button.setButtonText("载入修复").onClick(() => {
            this.editingStoredIndex = index;
            if (this.editor) this.editor.value = JSON.stringify(storedTheme, null, 2);
            this.validate();
          }))
          .addButton((button) => button.setWarning().setButtonText("删除").onClick(() => void this.removeAt(index)));
        return;
      }
      const savedThemeSetting = new Setting(saved)
        .setName(theme.name)
        .setDesc(`${theme.baseLayout} · ${theme.industryTags.join(" / ") || "未分类"}`);
      savedThemeSetting.settingEl.addClass("noterelay-custom-theme-saved-item");
      savedThemeSetting
        .addButton((button) => button.setButtonText("编辑").onClick(() => {
          this.editingStoredIndex = index;
          if (this.editor) this.editor.value = JSON.stringify(theme, null, 2);
          this.validate();
        }))
        .addButton((button) => button.setWarning().setButtonText("删除").onClick(() => void this.removeAt(index, theme.id)));
    });
  }

  private async copyPrompt(): Promise<void> {
    try {
      await navigator.clipboard.writeText(customWechatThemePrompt());
      new Notice("AI 主题生成提示词已复制");
    } catch (error) {
      new Notice(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validate(): boolean {
    const result = parseCustomWechatTheme(this.editor?.value ?? "");
    if (result.theme) {
      this.validation?.setText(`校验通过：${result.theme.name}（${result.theme.baseLayout}）`);
      this.validation?.removeClass("is-error");
      this.validation?.addClass("is-valid");
      return true;
    }
    this.validation?.setText(`校验失败：${result.errors.join("；")}`);
    this.validation?.removeClass("is-valid");
    this.validation?.addClass("is-error");
    return false;
  }

  private async save(): Promise<void> {
    const result = parseCustomWechatTheme(this.editor?.value ?? "");
    if (!result.theme) {
      this.validate();
      return;
    }
    const matchingIndex = this.plugin.settings.customWechatThemes.findIndex((storedTheme) => parseStoredCustomWechatTheme(storedTheme).theme?.id === result.theme?.id);
    const index = this.editingStoredIndex ?? matchingIndex;
    if (index >= 0) this.plugin.settings.customWechatThemes[index] = result.theme;
    else this.plugin.settings.customWechatThemes.push(result.theme);
    await this.plugin.saveSettings();
    new Notice(index >= 0 ? "自定义主题已更新" : "自定义主题已保存，可在公众号主题列表中选择");
    this.onSaved();
    this.onOpen();
  }

  private async removeAt(index: number, id?: string): Promise<void> {
    this.plugin.settings.customWechatThemes = this.plugin.settings.customWechatThemes.filter((_, itemIndex) => itemIndex !== index);
    if (id && this.plugin.settings.activeThemeIds.wechat === id) this.plugin.settings.activeThemeIds.wechat = "moyu-green";
    if (id) Object.values(this.plugin.settings.accountPreferences).forEach((preferences) => {
      if (preferences.themeId === id) delete preferences.themeId;
    });
    await this.plugin.saveSettings();
    this.onSaved();
    this.onOpen();
  }
}
