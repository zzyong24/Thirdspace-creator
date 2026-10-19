import { ItemView, Notice, WorkspaceLeaf, requestUrl, setIcon } from "obsidian";
import type NoteRelayPlugin from "../main";
import { rememberAccountPreferences, resolveSelectedAccount, settingsForAccount } from "../core/accountPreferences";
import { setSanitizedHtml } from "../core/dom";
import { parseNote } from "../core/markdown";
import { arrayBufferToBase64, imageMimeType } from "../core/imageData";
import { ACCOUNT_LABELS, PLATFORM_IDS, PLATFORM_LABELS } from "../core/platforms";
import { RednoteAdapter } from "../platforms/rednote/adapter";
import { REDNOTE_FONTS, REDNOTE_TEMPLATES } from "../platforms/rednote/presets";
import type { PlatformAdapter } from "../platforms/platform";
import { ToutiaoAdapter } from "../platforms/toutiao/adapter";
import { WechatAdapter } from "../platforms/wechat/adapter";
import { XAdapter } from "../platforms/x/adapter";
import { listThemes, resolveTheme } from "../themes/themeService";
import type { PlatformId, RenderContext, SocialAccount } from "../types";
import { AboutModal, TutorialModal } from "./infoModals";
import { openPluginSettings } from "./openSettings";
import { RednoteBackgroundModal } from "./rednoteBackgroundModal";

export const NOTERELAY_VIEW = "noterelay-view";

const REDNOTE_ADAPTER = new RednoteAdapter();
const ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  wechat: new WechatAdapter(),
  toutiao: new ToutiaoAdapter(),
  rednote: REDNOTE_ADAPTER,
  x: new XAdapter()
};

const COPY_LABELS: Record<PlatformId, string> = {
  wechat: "一键复制公众号文章",
  toutiao: "一键复制头条号文章",
  rednote: "复制当前图片",
  x: "复制 X 长文格式"
};

export class NoteRelayView extends ItemView {
  private platform: PlatformId = "wechat";
  private context?: RenderContext;
  private previewRoot?: HTMLElement;
  private renderVersion = 0;
  private rednoteFocusImageKey?: string;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: NoteRelayPlugin) { super(leaf); }
  getViewType(): string { return NOTERELAY_VIEW; }
  getDisplayText(): string { return "NoteRelay"; }
  getIcon(): string { return "send"; }

  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.render()));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file === this.app.workspace.getActiveFile()) this.render();
    }));
  }

  render(): void {
    const version = ++this.renderVersion;
    const configuredPlatforms = PLATFORM_IDS.filter((platform) => this.plugin.settings.enabledPlatforms[platform] !== false);
    const enabledPlatforms = configuredPlatforms.length ? configuredPlatforms : ["wechat" as PlatformId];
    if (!enabledPlatforms.includes(this.platform)) this.platform = enabledPlatforms[0] ?? "wechat";
    const platform = this.platform;
    this.context = undefined;
    this.previewRoot = undefined;

    const container = this.contentEl;
    container.empty();
    container.addClass("noterelay-view");

    const shell = container.createDiv({ cls: "noterelay-shell" });
    this.renderPlatformTabs(shell, platform, enabledPlatforms);

    const accounts = this.plugin.settings.accounts.filter((account) => account.platform === platform && account.enabled);
    const account = resolveSelectedAccount(this.plugin.settings, platform, accounts);
    const effectiveSettings = settingsForAccount(this.plugin.settings, account);
    const configuration = shell.createDiv({ cls: "noterelay-configuration" });
    if (platform === "rednote") this.renderRednoteControls(configuration, accounts, account, effectiveSettings);
    else {
      this.renderAccountControl(configuration, platform, accounts);
      if (platform === "toutiao") configuration.addClass("is-single");
      else this.renderThemeControl(configuration, platform, account, effectiveSettings);
    }

    const previewPanel = shell.createDiv({ cls: "noterelay-preview-panel" });
    const previewHeader = previewPanel.createDiv({ cls: "noterelay-preview-header" });
    previewHeader.createSpan({ text: "文章预览：" });
    const activeFile = this.app.workspace.getActiveFile();
    previewHeader.createSpan({ cls: "noterelay-file-name", text: activeFile?.basename ?? "未打开笔记" });
    const stage = previewPanel.createDiv({ cls: "noterelay-stage" });

    const copyArea = shell.createDiv({ cls: platform === "rednote" ? "noterelay-rednote-actions" : "noterelay-copy-area" });
    const copyButton = copyArea.createEl("button", {
      text: platform === "rednote" ? "下载当前页" : COPY_LABELS[platform],
      cls: platform === "rednote" ? "noterelay-rednote-action" : "noterelay-copy-button mod-cta",
      attr: { type: "button" }
    });
    const exportAllButton = platform === "rednote" ? copyArea.createEl("button", { text: "导出全部页", cls: "noterelay-rednote-action mod-cta", attr: { type: "button" } }) : undefined;
    copyButton.disabled = true;
    if (exportAllButton) exportAllButton.disabled = true;
    if (platform === "rednote") {
      copyButton.addEventListener("click", () => void this.runRednoteExport(copyButton, "current"));
      exportAllButton?.addEventListener("click", () => void this.runRednoteExport(exportAllButton, "all"));
    } else copyButton.addEventListener("click", () => void this.copyCurrent(copyButton));

    this.renderFooter(shell);

    if (!activeFile || activeFile.extension !== "md") {
      this.renderEmptyState(stage);
      return;
    }

    stage.createDiv({ cls: "noterelay-loading", text: "正在生成预览…" });
    void this.app.vault.read(activeFile).then((source) => {
      if (version !== this.renderVersion || this.app.workspace.getActiveFile() !== activeFile) return;
      const note = parseNote(source, activeFile.basename);
      const context: RenderContext = {
        note,
        account,
        theme: resolveTheme(effectiveSettings, platform),
        settings: effectiveSettings,
        notePath: activeFile.path,
        rednoteFocusImageKey: this.rednoteFocusImageKey,
        onRednoteImageWidthChange: async (imageKey, width) => {
          const noteOverrides = this.plugin.settings.rednoteImageWidths[activeFile.path] ?? {};
          if (width === undefined) delete noteOverrides[imageKey];
          else noteOverrides[imageKey] = width;
          if (Object.keys(noteOverrides).length) this.plugin.settings.rednoteImageWidths[activeFile.path] = noteOverrides;
          else delete this.plugin.settings.rednoteImageWidths[activeFile.path];
          this.rednoteFocusImageKey = imageKey;
          await this.plugin.saveSettings();
        },
        onRednoteImageRadiusChange: async (imageKey, radius) => {
          const noteOverrides = this.plugin.settings.rednoteImageRadii[activeFile.path] ?? {};
          if (radius <= 0) delete noteOverrides[imageKey];
          else noteOverrides[imageKey] = radius;
          if (Object.keys(noteOverrides).length) this.plugin.settings.rednoteImageRadii[activeFile.path] = noteOverrides;
          else delete this.plugin.settings.rednoteImageRadii[activeFile.path];
          this.rednoteFocusImageKey = imageKey;
          await this.plugin.saveSettings();
        },
        resolveImageSrc: (src) => {
          if (/^(?:https?:|data:|blob:|app:)/i.test(src)) return src;
          let decoded = src.replace(/^<|>$/g, "");
          try { decoded = decodeURIComponent(decoded); } catch { /* Use the source as written. */ }
          const imageFile = this.app.metadataCache.getFirstLinkpathDest(decoded, activeFile.path);
          return imageFile ? this.app.vault.getResourcePath(imageFile) : src;
        },
        resolveImageDataUrl: async (src) => {
          if (src.startsWith("data:")) return src;
          let decoded = src.replace(/^<|>$/g, "");
          try { decoded = decodeURIComponent(decoded); } catch { /* Use the source as written. */ }
          if (/^https?:\/\//i.test(decoded)) {
            const response = await requestUrl({ url: decoded, method: "GET" });
            const contentType = response.headers["content-type"]?.split(";", 1)[0] || imageMimeType(new URL(decoded).pathname.split(".").pop() || "");
            return `data:${contentType};base64,${arrayBufferToBase64(response.arrayBuffer)}`;
          }
          const imageFile = this.app.metadataCache.getFirstLinkpathDest(decoded, activeFile.path);
          if (!imageFile) return undefined;
          const binary = await this.app.vault.readBinary(imageFile);
          return `data:${imageMimeType(imageFile.extension)};base64,${arrayBufferToBase64(binary)}`;
        }
      };
      const root = ADAPTERS[platform].render(context);
      stage.empty();
      stage.appendChild(root);
      this.context = context;
      this.previewRoot = root;
      copyButton.disabled = false;
      if (exportAllButton) exportAllButton.disabled = false;
      root.querySelectorAll<HTMLButtonElement>("[data-rednote-copy]").forEach((button) => button.addEventListener("click", () => void this.copyCurrent(button)));
    }).catch((error) => {
      stage.empty();
      stage.createDiv({ cls: "noterelay-empty", text: "读取笔记失败，请打开开发者工具查看详情。" });
      new Notice(`读取笔记失败：${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private renderPlatformTabs(shell: HTMLElement, activePlatform: PlatformId, platforms: readonly PlatformId[]): void {
    const tabs = shell.createDiv({ cls: "noterelay-platform-tabs", attr: { role: "tablist", "aria-label": "发布平台" } });
    tabs.setCssProps({ "--noterelay-platform-count": String(platforms.length) });
    platforms.forEach((platform) => {
      const button = tabs.createEl("button", {
        cls: `noterelay-platform-tab is-${platform}${platform === activePlatform ? " is-active" : ""}`,
        attr: {
          type: "button",
          role: "tab",
          "aria-selected": String(platform === activePlatform)
        }
      });
      this.renderPlatformLogo(button, platform);
      button.createSpan({ cls: "noterelay-platform-label", text: PLATFORM_LABELS[platform] });
      button.addEventListener("click", () => {
        if (this.platform === platform) return;
        this.platform = platform;
        this.render();
      });
    });
  }

  private renderPlatformLogo(button: HTMLButtonElement, platform: PlatformId): void {
    const logo = button.createSpan({ cls: `noterelay-platform-logo is-${platform}`, attr: { "aria-hidden": "true" } });
    if (platform === "wechat") {
      setSanitizedHtml(logo, `<svg viewBox="0 0 28 24" role="img"><path fill="currentColor" d="M11.2 2C5.6 2 1 5.6 1 10c0 2.5 1.5 4.7 3.8 6.2l-.9 3.1 3.7-1.8c1.1.3 2.3.5 3.6.5h.5a7.4 7.4 0 0 1-.5-2.7c0-4.7 4.2-8.5 9.5-8.5h.4C19.5 3.9 15.6 2 11.2 2Zm-3.6 6.6a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm7.2 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z"/><path fill="currentColor" d="M27 15.2c0-3.8-3.8-6.9-8.4-6.9s-8.4 3.1-8.4 6.9 3.8 6.9 8.4 6.9c1 0 2-.2 2.9-.4l3.1 1.5-.7-2.6c1.9-1.3 3.1-3.2 3.1-5.4Zm-11.2-1.1a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Zm5.9 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z"/></svg>`);
      return;
    }
    if (platform === "rednote") {
      logo.createSpan({ text: "RED" });
      return;
    }
    if (platform === "toutiao") {
      logo.createSpan({ text: "头条" });
      return;
    }
    logo.createSpan({ text: "𝕏" });
  }

  private renderAccountControl(container: HTMLElement, platform: PlatformId, accounts: SocialAccount[]): void {
    const group = container.createDiv({ cls: "noterelay-control-group" });
    group.createEl("label", { text: ACCOUNT_LABELS[platform] });
    const select = group.createEl("select", { attr: { "aria-label": ACCOUNT_LABELS[platform] } });
    select.createEl("option", { value: "", text: accounts.length ? "不使用账号署名" : "尚未配置账号" });
    for (const account of accounts) select.createEl("option", { value: account.id, text: account.name });
    select.value = resolveSelectedAccount(this.plugin.settings, platform, accounts)?.id ?? "";
    select.addEventListener("change", () => void (async () => {
      this.plugin.settings.activeAccountIds[platform] = select.value;
      await this.plugin.saveSettings();
      this.render();
    })());
  }

  private renderThemeControl(container: HTMLElement, platform: PlatformId, account: SocialAccount | undefined, settings: RenderContext["settings"]): void {
    const group = container.createDiv({ cls: "noterelay-control-group" });
    group.createEl("label", { text: "主题" });
    const select = group.createEl("select", { attr: { "aria-label": `${PLATFORM_LABELS[platform]}主题` } });
    for (const theme of listThemes(settings, platform)) select.createEl("option", { value: theme.id, text: theme.name });
    select.value = resolveTheme(settings, platform).id;
    select.addEventListener("change", () => void (async () => {
      this.plugin.settings.activeThemeIds[platform] = select.value;
      rememberAccountPreferences(this.plugin.settings, account, { themeId: select.value });
      await this.plugin.saveSettings();
      this.render();
    })());
  }

  private renderRednoteControls(container: HTMLElement, accounts: SocialAccount[], account: SocialAccount | undefined, settings: RenderContext["settings"]): void {
    container.addClass("is-rednote");
    const selectControl = (label: string, ariaLabel: string, options: Array<{ value: string; text: string }>, value: string, onChange: (value: string) => Promise<void>) => {
      const group = container.createDiv({ cls: "noterelay-rednote-control" });
      group.createEl("label", { text: label });
      const select = group.createEl("select", { attr: { "aria-label": ariaLabel } });
      options.forEach((option) => select.createEl("option", option));
      select.value = value;
      select.addEventListener("change", () => void onChange(select.value));
    };
    const selectedAccountId = account?.id ?? "";
    selectControl("账号", "小红书账号", accounts.length ? accounts.map((account) => ({ value: account.id, text: account.name })) : [{ value: "", text: "尚未配置账号" }], selectedAccountId, async (value) => {
      this.plugin.settings.activeAccountIds.rednote = value;
      await this.plugin.saveSettings(); this.render();
    });
    selectControl("模板", "小红书图文模板", REDNOTE_TEMPLATES.map((item) => ({ value: item.id, text: item.name })), settings.rednoteTemplateId, async (value) => {
      this.plugin.settings.rednoteTemplateId = value as typeof this.plugin.settings.rednoteTemplateId;
      rememberAccountPreferences(this.plugin.settings, account, { rednoteTemplateId: this.plugin.settings.rednoteTemplateId });
      await this.plugin.saveSettings(); this.render();
    });
    selectControl("主题", "小红书主题", listThemes(settings, "rednote").map((item) => ({ value: item.id, text: item.name })), resolveTheme(settings, "rednote").id, async (value) => {
      this.plugin.settings.activeThemeIds.rednote = value;
      rememberAccountPreferences(this.plugin.settings, account, { themeId: value });
      await this.plugin.saveSettings(); this.render();
    });
    selectControl("字体", "小红书字体", REDNOTE_FONTS.map((item) => ({ value: item.value, text: item.name })), settings.rednoteFontFamily, async (value) => {
      this.plugin.settings.rednoteFontFamily = value;
      rememberAccountPreferences(this.plugin.settings, account, { rednoteFontFamily: value });
      await this.plugin.saveSettings(); this.render();
    });
    const fontGroup = container.createDiv({ cls: "noterelay-rednote-control is-font-size" });
    fontGroup.createEl("label", { text: "字号" });
    const decrease = fontGroup.createEl("button", { text: "−", attr: { type: "button", "aria-label": "减小字号" } });
    const fontValue = fontGroup.createSpan({ text: String(settings.rednoteFontSize) });
    const increase = fontGroup.createEl("button", { text: "+", attr: { type: "button", "aria-label": "增大字号" } });
    const changeFontSize = async (delta: number) => {
      this.plugin.settings.rednoteFontSize = Math.max(14, Math.min(42, settings.rednoteFontSize + delta));
      rememberAccountPreferences(this.plugin.settings, account, { rednoteFontSize: this.plugin.settings.rednoteFontSize });
      await this.plugin.saveSettings(); this.render();
    };
    decrease.addEventListener("click", () => void changeFontSize(-1));
    increase.addEventListener("click", () => void changeFontSize(1));
    fontValue.setAttr("aria-label", "当前字号");
    const backgroundGroup = container.createDiv({ cls: "noterelay-rednote-control is-background-button" });
    const backgroundButton = backgroundGroup.createEl("button", { text: "背景", attr: { type: "button", "aria-label": "设置小红书背景图片" } });
    setIcon(backgroundButton, "image");
    backgroundButton.createSpan({ text: "背景" });
    backgroundButton.addEventListener("click", () => new RednoteBackgroundModal(this.app, this.plugin, account, () => this.render()).open());
  }

  private renderEmptyState(stage: HTMLElement): void {
    const empty = stage.createDiv({ cls: "noterelay-empty" });
    const icon = empty.createDiv({ cls: "noterelay-empty-icon" });
    setIcon(icon, "file-text");
    empty.createEl("strong", { text: "请先打开一篇 Markdown 笔记" });
    empty.createSpan({ text: "NoteRelay 会在这里显示当前笔记的排版效果。" });
  }

  private renderFooter(shell: HTMLElement): void {
    const footer = shell.createDiv({ cls: "noterelay-footer" });
    const tutorialButton = footer.createEl("button", { cls: "noterelay-footer-button is-icon", attr: { type: "button", "aria-label": "使用教程" } });
    setIcon(tutorialButton, "circle-help");
    tutorialButton.addEventListener("click", () => new TutorialModal(this.app).open());

    const aboutButton = footer.createEl("button", { text: "关于作者", cls: "noterelay-footer-button", attr: { type: "button" } });
    aboutButton.addEventListener("click", () => new AboutModal(this.app).open());

    const settingsButton = footer.createEl("button", { cls: "noterelay-footer-button is-icon", attr: { type: "button", "aria-label": "全局设置" } });
    setIcon(settingsButton, "settings");
    settingsButton.addEventListener("click", () => openPluginSettings(this.app, this.plugin.manifest.id));
  }

  private async copyCurrent(button: HTMLButtonElement): Promise<void> {
    if (!this.context || !this.previewRoot) return;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "正在复制…";
    try {
      new Notice(await ADAPTERS[this.platform].copy(this.context, this.previewRoot));
      button.textContent = "复制成功";
      window.setTimeout(() => { button.textContent = originalLabel; }, 1200);
    } catch (error) {
      button.textContent = originalLabel;
      new Notice(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      button.disabled = false;
    }
  }

  private async runRednoteExport(button: HTMLButtonElement, mode: "current" | "all"): Promise<void> {
    if (!this.context || !this.previewRoot) return;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = mode === "all" ? "正在导出…" : "正在下载…";
    try {
      const message = mode === "all" ? await REDNOTE_ADAPTER.downloadAll(this.context, this.previewRoot) : await REDNOTE_ADAPTER.downloadCurrent(this.context, this.previewRoot);
      new Notice(message);
    } catch (error) {
      new Notice(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      button.textContent = originalLabel;
      button.disabled = false;
    }
  }
}
