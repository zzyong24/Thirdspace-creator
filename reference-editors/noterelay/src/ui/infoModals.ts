import { App, Modal, setIcon } from "obsidian";
import wechatSponsorQrDataUrl from "../../assets/wechat-sponsor-qr.png";

const SUPPORTERS_LIST_URL = "https://github.com/x-supermeng/noterelay/blob/main/docs/Support.zh-CN.md";

export class TutorialModal extends Modal {
  constructor(app: App) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("noterelay-modal");
    const header = this.contentEl.createDiv({ cls: "noterelay-modal-header" });
    const icon = header.createDiv({ cls: "noterelay-modal-icon" });
    setIcon(icon, "book-open");
    const title = header.createDiv();
    title.createEl("h2", { text: "NoteRelay 使用教程" });
    title.createEl("p", { text: "一篇笔记，适配四个内容平台。" });

    const steps = this.contentEl.createDiv({ cls: "noterelay-tutorial-steps" });
    this.createStep(steps, "1", "打开笔记", "在 Obsidian 中打开需要排版的 Markdown 笔记。", "file-text");
    this.createStep(steps, "2", "选择平台", "在首页顶部切换公众号、头条号、小红书或 X。", "panels-top-left");
    this.createStep(steps, "3", "选择账号和排版", "账号资料用于署名；支持主题的平台可继续选择预览样式。", "palette");
    this.createStep(steps, "4", "检查并复制", "确认预览后点击主按钮，再粘贴到目标平台编辑器。", "copy");

    const note = this.contentEl.createDiv({ cls: "noterelay-modal-note" });
    const noteIcon = note.createSpan();
    setIcon(noteIcon, "info");
    note.createSpan({ text: "NoteRelay 不登录平台，也不会自动发布。粘贴后请完成最终检查。" });
  }

  private createStep(container: HTMLElement, number: string, title: string, description: string, iconName: string): void {
    const step = container.createDiv({ cls: "noterelay-tutorial-step" });
    step.createSpan({ cls: "noterelay-step-number", text: number });
    const icon = step.createSpan({ cls: "noterelay-step-icon" });
    setIcon(icon, iconName);
    const copy = step.createDiv();
    copy.createEl("strong", { text: title });
    copy.createEl("p", { text: description });
  }
}

export class AboutModal extends Modal {
  constructor(app: App) { super(app); }

  onOpen(): void {
    this.modalEl.addClass("noterelay-modal", "noterelay-about-modal");
    const brand = this.contentEl.createDiv({ cls: "noterelay-about-brand" });
    const mark = brand.createDiv({ cls: "noterelay-brand-mark" });
    setIcon(mark, "send");
    brand.createEl("h2", { text: "NoteRelay · 文递" });
    brand.createEl("p", { text: "由超级猛（x-supermeng）发起的 Obsidian 多平台内容排版插件。" });

    const description = this.contentEl.createDiv({ cls: "noterelay-about-description" });
    description.createEl("p", { text: "我习惯在 Obsidian 中完成写作，也希望一次创作能够更轻松地抵达不同平台。NoteRelay 因此诞生：把同一篇 Markdown 笔记分别整理成适合微信公众号、头条号、小红书和 X 的内容形式。" });
    description.createEl("p", { text: "它只负责排版、预览、复制与导出，不登录平台、不保存发布凭据，也不会替你自动发送。内容最终如何呈现，始终由创作者自己检查和决定。" });
    description.createEl("p", { text: "项目以 AGPL-3.0-or-later 协议开源。欢迎使用、反馈和参与改进，也欢迎在 GitHub 关注 x-supermeng/noterelay。" });

    const qrcodes = this.contentEl.createDiv({ cls: "noterelay-about-qrcodes" });
    this.createQrCode(qrcodes, "个人微信", "扫码添加作者微信", "https://blog-oss.x-qu.com/blog/20260723181509936.png", "is-personal");
    this.createQrCode(qrcodes, "微信公众号", "扫码关注公众号「超级猛」", "https://blog-oss.x-qu.com/blog/20260723181218073.png", "is-official");
    this.createQrCode(qrcodes, "微信打赏", "如果 NoteRelay 对你有帮助，欢迎扫码支持持续维护。", wechatSponsorQrDataUrl, "is-sponsor", {
      label: "查看打赏名单",
      url: SUPPORTERS_LIST_URL
    });

    const badges = this.contentEl.createDiv({ cls: "noterelay-about-badges" });
    badges.createSpan({ text: "超级猛出品" });
    badges.createSpan({ text: "AGPL-3.0-or-later" });
    badges.createSpan({ text: "公众号 · 头条号 · 小红书 · X" });
  }

  private createQrCode(
    container: HTMLElement,
    title: string,
    description: string,
    imageUrl: string,
    variant: "is-personal" | "is-official" | "is-sponsor",
    link?: { label: string; url: string }
  ): void {
    const card = container.createDiv({ cls: `noterelay-about-qr-card ${variant}` });
    card.createEl("strong", { text: title });
    card.createEl("img", {
      attr: {
        src: imageUrl,
        alt: `${title}二维码`,
        loading: "lazy"
      }
    });
    card.createSpan({ text: description });
    if (link) {
      card.createEl("a", {
        text: link.label,
        attr: {
          href: link.url,
          target: "_blank",
          rel: "noopener noreferrer"
        }
      });
    }
  }
}
