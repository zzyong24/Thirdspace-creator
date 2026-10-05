import { App, Modal, Setting } from "obsidian";
import type NoteRelayPlugin from "../main";
import { rememberAccountPreferences, settingsForAccount } from "../core/accountPreferences";
import { REDNOTE_BACKGROUNDS } from "../platforms/rednote/presets";
import type { SocialAccount } from "../types";

export class RednoteBackgroundModal extends Modal {
  private image: string;
  private scale: number;
  private position: { x: number; y: number };
  private preview?: HTMLElement;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };

  constructor(app: App, private readonly plugin: NoteRelayPlugin, private readonly account?: SocialAccount, private readonly onApply?: () => void) {
    super(app);
    const settings = settingsForAccount(plugin.settings, account);
    this.image = settings.rednoteBackgroundImage;
    this.scale = settings.rednoteBackgroundScale;
    this.position = { ...settings.rednoteBackgroundPosition };
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("noterelay-background-modal");
    this.contentEl.createEl("h2", { text: "背景图片" });
    const gallery = this.contentEl.createDiv({ cls: "noterelay-background-gallery" });
    REDNOTE_BACKGROUNDS.filter((item) => item.image).forEach((item) => {
      const button = gallery.createEl("button", { cls: "noterelay-background-thumb", attr: { type: "button", "aria-label": item.name } });
      button.createEl("img", { attr: { src: item.image, alt: item.name } });
      button.addEventListener("click", () => { this.image = item.image; this.scale = 1; this.position = { x: 0, y: 0 }; this.updatePreview(); });
    });
    this.preview = this.contentEl.createDiv({ cls: "noterelay-background-preview" });
    this.preview.addEventListener("mousedown", (event) => {
      this.dragging = true;
      this.dragStart = { x: event.clientX - this.position.x, y: event.clientY - this.position.y };
      this.preview?.addClass("is-dragging");
    });
    this.preview.addEventListener("mousemove", (event) => {
      if (!this.dragging) return;
      this.position = { x: event.clientX - this.dragStart.x, y: event.clientY - this.dragStart.y };
      this.updatePreview();
    });
    const finishDrag = () => { this.dragging = false; this.preview?.removeClass("is-dragging"); };
    this.preview.addEventListener("mouseup", finishDrag);
    this.preview.addEventListener("mouseleave", finishDrag);

    new Setting(this.contentEl).addButton((button) => button.setButtonText("选择图片").onClick(() => this.chooseImage())).addButton((button) => button.setButtonText("清除图片").onClick(() => { this.image = ""; this.scale = 1; this.position = { x: 0, y: 0 }; this.updatePreview(); }));
    new Setting(this.contentEl).setName("缩放").addSlider((slider) => slider.setLimits(.1, 2, .01).setValue(this.scale).onChange((value) => { this.scale = value; this.updatePreview(); }));
    new Setting(this.contentEl).setName("位置 X").addSlider((slider) => slider.setLimits(-200, 200, 1).setValue(this.position.x).onChange((value) => { this.position.x = value; this.updatePreview(); }));
    new Setting(this.contentEl).setName("位置 Y").addSlider((slider) => slider.setLimits(-200, 200, 1).setValue(this.position.y).onChange((value) => { this.position.y = value; this.updatePreview(); }));
    new Setting(this.contentEl).addButton((button) => button.setButtonText("取消").onClick(() => this.close())).addButton((button) => button.setButtonText("确认").setCta().onClick(async () => {
      this.plugin.settings.rednoteBackgroundImage = this.image;
      this.plugin.settings.rednoteBackgroundScale = this.scale;
      this.plugin.settings.rednoteBackgroundPosition = this.position;
      rememberAccountPreferences(this.plugin.settings, this.account, {
        rednoteBackgroundImage: this.image,
        rednoteBackgroundScale: this.scale,
        rednoteBackgroundPosition: { ...this.position }
      });
      await this.plugin.saveSettings();
      this.close();
      this.onApply?.();
    }));
    this.updatePreview();
  }

  private chooseImage(): void {
    const input = createEl("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => { this.image = typeof reader.result === "string" ? reader.result : ""; this.updatePreview(); });
      reader.readAsDataURL(file);
    });
    input.click();
  }

  private updatePreview(): void {
    if (!this.preview) return;
    this.preview.style.backgroundImage = this.image ? `url("${this.image.replace(/"/g, "%22")}")` : "none";
    this.preview.style.backgroundSize = `${this.scale * 100}%`;
    this.preview.style.backgroundPosition = `${this.position.x}px ${this.position.y}px`;
  }
}
