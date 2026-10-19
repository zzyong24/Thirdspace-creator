import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type NoteRelayPlugin from "../main";
import { AVATAR_ALLOWED_TYPES, AVATAR_MAX_FILE_BYTES, AVATAR_OUTPUT_SIZE, normalizeAvatar } from "../core/avatar";
import { PLATFORM_IDS, PLATFORM_LABELS } from "../core/platforms";
import type { PlatformId, SocialAccount } from "../types";
import { CustomWechatThemesModal } from "./customWechatThemesModal";

const ACCOUNT_FIELD_USAGE: Record<PlatformId, { handle: boolean; avatar: boolean; signature: boolean }> = {
  wechat: { handle: false, avatar: false, signature: true },
  toutiao: { handle: false, avatar: false, signature: true },
  rednote: { handle: true, avatar: true, signature: true },
  x: { handle: true, avatar: false, signature: true }
};

export class NoteRelaySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: NoteRelayPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("前台平台标签").setHeading();
    containerEl.createEl("p", { text: "控制 NoteRelay 预览页顶部显示哪些平台标签，至少保留一个平台。" });
    for (const platform of PLATFORM_IDS) {
      new Setting(containerEl)
        .setName(PLATFORM_LABELS[platform])
        .setDesc(`在预览页显示${PLATFORM_LABELS[platform]}标签`)
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.enabledPlatforms[platform] !== false)
          .onChange(async (value) => {
            const enabledCount = PLATFORM_IDS.filter((id) => this.plugin.settings.enabledPlatforms[id] !== false).length;
            if (!value && enabledCount <= 1) {
              new Notice("至少保留一个平台标签");
              this.display();
              return;
            }
            this.plugin.settings.enabledPlatforms[platform] = value;
            await this.plugin.saveSettings();
          }));
    }

    new Setting(containerEl).setName("公众号自定义主题").setHeading();
    new Setting(containerEl)
      .setName("AI 生成主题配置")
      .setDesc("复制带注释规范的提示词，让 AI 生成纯 JSON；导入后可在公众号主题列表选择，并随账号记忆。")
      .addButton((button) => button.setButtonText("管理自定义主题").setCta().onClick(() => new CustomWechatThemesModal(this.app, this.plugin, () => this.display()).open()));

    containerEl.createEl("p", { text: "账号仅用于预览署名和复制内容，不保存密码、Cookie 或发布凭据。" });

    new Setting(containerEl).setName("自媒体账号").setHeading();
    for (const platform of PLATFORM_IDS) {
      const section = containerEl.createDiv({ cls: `noterelay-account-section is-${platform}` });
      new Setting(section).setName(`${PLATFORM_LABELS[platform]}账号`).setHeading();
      const accounts = this.plugin.settings.accounts.filter((account) => account.platform === platform);
      if (!accounts.length) section.createEl("p", { cls: "noterelay-account-empty", text: `尚未配置${PLATFORM_LABELS[platform]}账号` });
      for (const account of accounts) this.renderAccount(account, section);
      new Setting(section).setName(`添加${PLATFORM_LABELS[platform]}账号`).setDesc("可以配置多个账号并在预览页切换")
        .addButton((button) => button.setButtonText("添加").setCta().onClick(async () => {
          this.plugin.settings.accounts.push({ id: crypto.randomUUID(), platform, name: "新账号", handle: "", avatarUrl: "", signature: "", variables: {}, enabled: true });
          await this.plugin.saveSettings(); this.display();
        }));
    }

    new Setting(containerEl).setName("小红书卡片").setHeading();
    new Setting(containerEl).setName("分页标题级别").addDropdown((dropdown) => dropdown
      .addOption("2", "二级标题 ##")
      .addOption("1", "一级标题 #")
      .setValue(String(this.plugin.settings.rednoteSplitHeading))
      .onChange(async (value) => { this.plugin.settings.rednoteSplitHeading = value === "1" ? 1 : 2; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("复制清晰度").setDesc("推荐 2 倍；更高倍数会占用更多内存").addSlider((slider) => slider
      .setLimits(1, 3, 1).setValue(this.plugin.settings.rednoteCopyScale)
      .onChange(async (value) => { this.plugin.settings.rednoteCopyScale = value; await this.plugin.saveSettings(); }));

  }

  private renderAccount(account: SocialAccount, parent: HTMLElement): void {
    const card = parent.createDiv({ cls: "noterelay-account-card" });
    const isRednote = account.platform === "rednote";
    const isX = account.platform === "x";
    const fields = ACCOUNT_FIELD_USAGE[account.platform];
    const heading = new Setting(card).setName(account.name || "未命名账号").setDesc(account.enabled ? "已启用" : "已停用");
    heading.addToggle((toggle) => toggle.setValue(account.enabled).setTooltip("是否在预览页显示").onChange(async (value) => { account.enabled = value; await this.plugin.saveSettings(); this.display(); }));
    heading.addButton((button) => button.setWarning().setButtonText("删除").onClick(async () => {
      this.plugin.settings.accounts = this.plugin.settings.accounts.filter((item) => item.id !== account.id);
      delete this.plugin.settings.accountPreferences[account.id];
      await this.plugin.saveSettings(); this.display();
    }));
    new Setting(card).setName(isRednote ? "博主名称" : isX ? "X 昵称" : "账号名称").setDesc("用于署名和模板变量")
      .addText((text) => text.setPlaceholder(isRednote ? "例如：超级猛" : isX ? "例如：NoteRelay" : "账号名称").setValue(account.name).onChange(async (value) => { account.name = value; await this.plugin.saveSettings(); }));
    if (fields.handle) {
      new Setting(card).setName(isRednote ? "博主 ID" : "X 用户名 / ID")
        .setDesc(isRednote ? "小红书 ID 为空时不会在卡片中显示" : "显示在 X 预览顶部，建议填写 @ 开头的用户名，例如 @noterelay")
        .addText((text) => text.setPlaceholder(isRednote ? "例如：xiaohongshu_888" : "例如：@noterelay").setValue(account.handle).onChange(async (value) => { account.handle = value; await this.plugin.saveSettings(); }));
    }
    if (fields.avatar) this.renderAvatarSetting(card, account);
    if (fields.signature) {
      new Setting(card).setName(isRednote ? "博主简介 / 宣传语" : isX ? "X 个人简介 / 文末签名" : "账号介绍 / 签名")
        .addTextArea((area) => area.setValue(account.signature).setPlaceholder(isRednote ? "显示在卡片底部，例如：专注 AI 效率与创作" : isX ? "例如：关注 AI、效率工具与独立开发；复制 X 长文时显示在末尾" : "复制内容末尾显示的签名").onChange(async (value) => { account.signature = value; await this.plugin.saveSettings(); }));
    }
    const variablesSetting = new Setting(card)
      .setName(isX ? "X 自定义变量（环境变量）" : "自定义变量")
      .setDesc("每行一个“变量名=值”；文章和海报模板中使用 {{变量名}}，未填写时保留原占位符")
      .addTextArea((area) => area
        .setPlaceholder(isX
          ? "栏目=AI 观察\n作者称呼=NoteRelay\n文末引导=关注我，持续分享 AI 实战\n话题=#AI #Obsidian"
          : "栏目=AI 观察\n顶部标签=CLAUDE · AGENTS\n重点=做 Agent 最难的那层，终于有人替你搭了\n话题=#Claude #Agents")
        .setValue(formatVariables(account.variables))
        .onChange(async (value) => {
          account.variables = parseVariables(value);
          await this.plugin.saveSettings();
        }));
    variablesSetting.settingEl.addClass("noterelay-account-variables");
  }

  private renderAvatarSetting(card: HTMLElement, account: SocialAccount): void {
    const setting = new Setting(card).setName("头像").setDesc("用于小红书卡片头像。建议使用 1:1 方图，至少 64×64；本地图片最大 8 MB，上传后自动居中裁剪并压缩为 256×256。");
    const preview = setting.controlEl.createEl("img", {
      cls: "noterelay-avatar-preview",
      attr: { alt: "当前头像预览" }
    });
    preview.addEventListener("load", () => preview.removeClass("is-invalid"));
    preview.addEventListener("error", () => preview.addClass("is-invalid"));
    this.updateAvatarPreview(preview, account.avatarUrl);
    setting
      .addText((text) => text.setPlaceholder("https://…").setValue(account.avatarUrl).onChange(async (value) => {
        account.avatarUrl = value;
        this.updateAvatarPreview(preview, value);
        await this.plugin.saveSettings();
      }))
      .addButton((button) => button.setButtonText("选择图片").onClick(() => this.chooseAvatar(account)));
  }

  private updateAvatarPreview(preview: HTMLImageElement, source: string): void {
    const value = source.trim();
    preview.toggleClass("is-visible", Boolean(value));
    preview.toggleClass("is-invalid", false);
    if (value) preview.src = value;
    else preview.removeAttribute("src");
  }

  private chooseAvatar(account: SocialAccount): void {
    const input = createEl("input");
    input.type = "file";
    input.accept = ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
        new Notice("头像格式不支持，请选择 JPG、PNG、WebP 或 GIF 图片");
        return;
      }
      if (file.size > AVATAR_MAX_FILE_BYTES) {
        new Notice("头像文件不能超过 8 MB，请先压缩后再上传");
        return;
      }
      new Notice("正在处理头像…");
      void normalizeAvatar(file).then(async (dataUrl) => {
        account.avatarUrl = dataUrl;
        await this.plugin.saveSettings();
        this.display();
        new Notice(`头像已压缩为 ${AVATAR_OUTPUT_SIZE}×${AVATAR_OUTPUT_SIZE}`);
      }).catch((error) => {
        console.error("NoteRelay avatar processing failed", error);
        new Notice(error instanceof Error ? error.message : "头像处理失败，请更换图片后重试");
      });
    });
    input.click();
  }
}

function formatVariables(variables: Record<string, string> | undefined): string {
  return Object.entries(variables ?? {}).map(([key, value]) => `${key}=${value}`).join("\n");
}

function parseVariables(input: string): Record<string, string> {
  const variables: Record<string, string> = {};
  input.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^=：:]+?)\s*(?:=|：|:)\s*(.*?)\s*$/);
    if (!match) return;
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value) variables[key] = value;
  });
  return variables;
}
