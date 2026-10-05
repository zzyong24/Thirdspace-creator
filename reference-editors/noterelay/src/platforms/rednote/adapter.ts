import {png} from "../../../web/host-port";
import { toPng } from "html-to-image";
import { zipSync } from "fflate";
import MarkdownIt from "markdown-it";
import { requestUrl } from "obsidian";
import { replaceAccountVariables } from "../../core/accountVariables";
import { copyPng } from "../../core/clipboard";
import { setSanitizedHtml, createEl, createDiv, appendEl, appendSpan, setCssProps } from "../../core/dom";
import { escapeAttr, escapeHtml } from "../../core/html";
import { blobToDataUrl } from "../../core/imageData";
import type { RenderContext, RednoteTemplateId } from "../../types";
import type { PlatformAdapter } from "../platform";
import { compactTableToFit, contentOverflows, firstBodyNode, movableContentNodes, splitElementToFit } from "./domPaginate";
import { splitByHeading } from "./paginate";
import { REDNOTE_IMAGE_SIZE } from "./presets";

const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
const PREVIEW_WIDTH = 450;
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
const layoutPromises = new WeakMap<HTMLElement, Promise<void>>();
const defaultImageRenderer = markdown.renderer.rules.image ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
interface RednoteMarkdownEnv {
  resolveImageSrc?: (src: string) => string;
  imageIndex?: number;
  sectionIndex?: number;
}

markdown.renderer.rules.image = (tokens, index, options, env: RednoteMarkdownEnv, self) => {
  const srcIndex = tokens[index].attrIndex("src");
  if (srcIndex >= 0) {
    const raw = tokens[index].attrs![srcIndex][1];
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch { /* Keep the original URL. */ }
    tokens[index].attrs![srcIndex][1] = env.resolveImageSrc ? env.resolveImageSrc(decoded) : decoded;
    tokens[index].attrSet("data-noterelay-source", decoded);
    const imageIndex = env.imageIndex ?? 0;
    tokens[index].attrSet("data-noterelay-image-key", `${env.sectionIndex ?? 0}:${imageIndex}:${decoded}`);
    env.imageIndex = imageIndex + 1;
    tokens[index].attrSet("loading", "eager");
  }
  return defaultImageRenderer(tokens, index, options, env, self);
};

export class RednoteAdapter implements PlatformAdapter {
  id = "rednote" as const;
  label = "小红书";

  render(context: RenderContext): HTMLElement {
    const { note, account, settings } = context;
    const imageSize = REDNOTE_IMAGE_SIZE;
    const resolvedMarkdown = replaceAccountVariables(note.markdown, account);
    const pages = splitByHeading(resolvedMarkdown, settings.rednoteSplitHeading);
    const previewHeight = Math.round(PREVIEW_WIDTH * imageSize.height / imageSize.width);
    const root = createDiv();
    root.className = `noterelay-rednote noterelay-themed is-template-${settings.rednoteTemplateId}`;
    root.dataset.activeIndex = "0";

    const cards = createDiv();
    cards.className = "noterelay-rednote-cards";
    pages.forEach((page, index) => cards.appendChild(this.createCard(page, index, index, context, previewHeight)));
    const copyButtonHost = createDiv();
    setSanitizedHtml(copyButtonHost, copyIconButton());
    cards.append(...Array.from(copyButtonHost.childNodes));

    const nav = createDiv();
    nav.className = "noterelay-card-nav";
    setSanitizedHtml(nav, `<button type="button" data-direction="prev" aria-label="上一页">←</button><span>${pages.length ? 1 : 0} / ${pages.length}</span><button type="button" data-direction="next" aria-label="下一页">→</button>`);
    nav.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-direction]");
      if (!button) return;
      const total = cards.querySelectorAll("[data-card-index]").length;
      const current = Number(root.dataset.activeIndex || 0);
      const next = button.dataset.direction === "next" ? Math.min(total - 1, current + 1) : Math.max(0, current - 1);
      root.dataset.activeIndex = String(next);
      cards.querySelectorAll<HTMLElement>("[data-card-index]").forEach((item, itemIndex) => item.classList.toggle("is-active", itemIndex === next));
      const label = nav.querySelector("span");
      if (label) label.textContent = `${next + 1} / ${total}`;
      this.updateNavigation(nav, next, total);
    });
    this.updateNavigation(nav, 0, pages.length);
    root.append(cards);
    if (!context.nativeControls) this.attachImageControls(root, context);
    else root.querySelectorAll<HTMLImageElement>("img[data-noterelay-image-key]").forEach(image => image.addEventListener("click", () => context.onImageSelected?.(image.dataset.noterelayImageKey || ""), {signal: context.signal}));
    root.append(nav);
    root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
      if (!image.complete) image.addEventListener("load", () => void this.ensureLayout(root, context).catch(() => undefined), { once: true });
    });
    const frame = window.requestAnimationFrame(() => {if (!context.signal?.aborted) void this.ensureLayout(root, context).catch(() => undefined);});
    context.signal?.addEventListener("abort", () => window.cancelAnimationFrame(frame), {once: true});
    return root;
  }

  async copy(context: RenderContext, root: HTMLElement): Promise<string> {
    await this.ensureLayout(root, context);
    await copyPng(await this.renderCurrentPng(root, context), context.onDeliver);
    return "当前小红书卡片已复制为 PNG";
  }

  async downloadCurrent(context: RenderContext, root: HTMLElement): Promise<string> {
    await this.ensureLayout(root, context);
    const active = Number(root.dataset.activeIndex || 0);
    await downloadDataUrl(await this.renderCurrentPng(root, context), `${safeName(context.note.title)}-${active + 1}.png`, context);
    return "当前页已下载";
  }

  async downloadAll(context: RenderContext, root: HTMLElement): Promise<string> {
    await this.ensureLayout(root, context);
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".noterelay-rednote-card"));
    if (!cards.length) throw new Error("没有可导出的卡片");
    const files: Record<string, Uint8Array> = {};
    for (let index = 0; index < cards.length; index += 1) {
      const dataUrl = await this.renderCardPng(cards[index], context);
      context.signal?.throwIfAborted();
      const base64 = dataUrl.split(",", 2)[1];
      if (!base64) throw new Error(`第 ${index + 1} 页图片数据无效`);
      files[`${safeName(context.note.title)}-${String(index + 1).padStart(2, "0")}.png`] = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    }
    const blob = new Blob([zipSync(files, { level: 6 })], { type: "application/zip" });
    await downloadBlob(blob, `${safeName(context.note.title)}-全部页面.zip`, context);
    return `已将 ${cards.length} 页图片打包导出`;
  }

  private async renderCurrentPng(root: HTMLElement, context: RenderContext): Promise<string> {
    const card = root.querySelector<HTMLElement>(".noterelay-rednote-card.is-active");
    if (!card) throw new Error("找不到当前小红书卡片");
    return this.renderCardPng(card, context);
  }

  private createCard(page: string, index: number, sectionIndex: number, context: RenderContext, previewHeight: number): HTMLElement {
    const { account, settings, theme } = context;
    const tokens = theme.tokens;
    const imageSize = REDNOTE_IMAGE_SIZE;
    const card = createEl("article");
    card.className = `noterelay-rednote-card red-image-preview${index === 0 ? " is-active" : ""}`;
    card.dataset.cardIndex = String(index);
    card.dataset.sectionIndex = String(sectionIndex);
    card.dataset.exportWidth = String(imageSize.width);
    card.dataset.exportHeight = String(imageSize.height);
    setCssProps(card, {
      "--nr-card-width": `${PREVIEW_WIDTH}px`,
      "--nr-card-height": `${previewHeight}px`,
      "--nr-card-padding": `${tokens.cardPadding}px`,
      "--nr-card-background": settings.rednoteBackgroundImage ? "transparent" : tokens.background,
      "--nr-card-text": tokens.text,
      "--nr-card-font": settings.rednoteFontFamily,
      "--nr-card-font-size": `${settings.rednoteFontSize}px`,
      "--nr-card-line-height": String(tokens.lineHeight),
      "--nr-card-radius": `${tokens.radius}px`,
      "--nr-accent": tokens.accent,
      "--nr-surface": tokens.surface,
      "--nr-border": tokens.border,
      "--nr-muted": tokens.muted,
      "--nr-title": tokens.title ?? tokens.text,
      "--nr-code": tokens.code ?? tokens.surface,
      "--nr-quote-background": tokens.quoteBackground ?? "transparent",
      "--nr-card-shadow": tokens.glow ?? "0 4px 12px rgba(0,0,0,.1)"
    });
    const background = renderCardBackground(settings.rednoteBackgroundImage, settings.rednoteBackgroundScale, settings.rednoteBackgroundPosition);
    setSanitizedHtml(card, `${background}${renderCardHeader(settings.rednoteTemplateId, account?.name ?? "", account?.handle ?? "", account?.avatarUrl ?? "")}<section class="red-preview-content"><main class="noterelay-card-content red-content-section red-section-active">${markdown.render(page, { resolveImageSrc: context.resolveImageSrc, imageIndex: 0, sectionIndex })}</main></section>${renderCardFooter(settings.rednoteTemplateId, account?.signature || "", account?.handle || "", account?.name || "")}`);
    const overrides = context.notePath ? settings.rednoteImageWidths[context.notePath] : undefined;
    const radii = context.notePath ? settings.rednoteImageRadii[context.notePath] : undefined;
    card.querySelectorAll<HTMLImageElement>(".noterelay-card-content img[data-noterelay-image-key]").forEach((image) => {
      const imageKey = image.dataset.noterelayImageKey || "";
      const width = overrides?.[imageKey];
      if (Number.isFinite(width)) this.applyImageWidth(image, width);
      this.applyImageRadius(image, radii?.[imageKey] ?? 0);
    });
    return card;
  }

  ensureLayout(root: HTMLElement, context: RenderContext): Promise<void> {
    const existing = layoutPromises.get(root);
    if (existing) return existing;
    const promise = (async () => {
      if (!root.isConnected) await nextAnimationFrame();
      await abortable(document.fonts?.ready ?? Promise.resolve(), context.signal);
      context.signal?.throwIfAborted();
      await waitForImages(root, context.signal);
      context.signal?.throwIfAborted();
      if (root.dataset.layoutBalanced === "true") return;
      this.balanceCards(root, context);
      root.dataset.layoutBalanced = "true";
      if (context.rednoteFocusImageKey) this.revealImage(root, context.rednoteFocusImageKey);
      root.dispatchEvent(new CustomEvent("noterelay-rednote-layout"));
    })();
    layoutPromises.set(root, promise);
    void promise.then(
      () => { if (layoutPromises.get(root) === promise) layoutPromises.delete(root); },
      () => { if (layoutPromises.get(root) === promise) layoutPromises.delete(root); }
    );
    return promise;
  }

  private balanceCards(root: HTMLElement, context: RenderContext): void {
    const host = root.querySelector<HTMLElement>(".noterelay-rednote-cards");
    const nav = root.querySelector<HTMLElement>(".noterelay-card-nav");
    if (!host) return;
    let cardIndex = 0;
    let operations = 0;
    while (cardIndex < host.querySelectorAll(".noterelay-rednote-card").length && operations < 500) {
      const cards = Array.from(host.querySelectorAll<HTMLElement>(".noterelay-rednote-card"));
      const card = cards[cardIndex];
      card.classList.add("is-measuring");
      const content = card.querySelector<HTMLElement>(".noterelay-card-content");
      this.applyContentSafeHeight(card);
      while (content && contentOverflows(content) && operations < 500) {
        operations += 1;
        const bodyNodes = movableContentNodes(content);
        if (!bodyNodes.length) break;
        const last = bodyNodes[bodyNodes.length - 1];
        const isTable = (last instanceof HTMLTableElement);
        const hasOnlySectionHeadingsBefore = bodyNodes.slice(0, -1).every((node) => /^H[3-6]$/.test(node.tagName));
        const canFillCurrentCard = bodyNodes.length === 1 || (isTable && hasOnlySectionHeadingsBefore);
        let overflowNode: HTMLElement | undefined;
        if (isTable && canFillCurrentCard && compactTableToFit(content, last)) continue;
        if (canFillCurrentCard) overflowNode = splitElementToFit(content, last);
        if (canFillCurrentCard && !overflowNode) {
          last.classList.add("is-overflow-fallback");
          break;
        }
        if (!overflowNode) {
          overflowNode = last;
          overflowNode.remove();
        }
        const nextCard = this.ensureContinuationCard(host, card, context);
        const nextContent = nextCard.querySelector<HTMLElement>(".noterelay-card-content");
        if (!nextContent) break;
        nextContent.insertBefore(overflowNode, firstBodyNode(nextContent));
        const trailing = movableContentNodes(content).at(-1);
        if (trailing && /^H[3-6]$/.test(trailing.tagName)) {
          trailing.remove();
          nextContent.insertBefore(trailing, firstBodyNode(nextContent));
        }
      }
      card.classList.remove("is-measuring");
      cardIndex += 1;
    }
    const cards = Array.from(host.querySelectorAll<HTMLElement>(".noterelay-rednote-card"));
    cards.forEach((card, index) => {
      card.dataset.cardIndex = String(index);
      card.classList.toggle("is-active", index === Number(root.dataset.activeIndex || 0));
    });
    const active = Math.min(Number(root.dataset.activeIndex || 0), Math.max(0, cards.length - 1));
    root.dataset.activeIndex = String(active);
    const label = nav?.querySelector("span");
    if (label) label.textContent = `${active + 1} / ${cards.length}`;
    if (nav) this.updateNavigation(nav, active, cards.length);
  }

  private applyContentSafeHeight(card: HTMLElement): void {
    const content = card.querySelector<HTMLElement>(".noterelay-card-content");
    const footer = card.querySelector<HTMLElement>(".red-preview-footer");
    if (!content || !footer) return;
    footer.classList.remove("is-wrapping");
    if (footer.scrollWidth > footer.clientWidth + 1) footer.classList.add("is-wrapping");
    content.style.removeProperty("height");
    const layoutHeight = content.clientHeight;
    const footerSafeHeight = Math.floor(footer.getBoundingClientRect().top - content.getBoundingClientRect().top - 8);
    content.style.height = `${Math.max(1, Math.min(layoutHeight, footerSafeHeight))}px`;
  }

  private ensureContinuationCard(host: HTMLElement, current: HTMLElement, context: RenderContext): HTMLElement {
    const sectionIndex = current.dataset.sectionIndex || "0";
    const next = current.nextElementSibling;
    if (next instanceof HTMLElement && next.matches(".noterelay-rednote-card") && next.dataset.sectionIndex === sectionIndex) return next;
    const total = host.querySelectorAll(".noterelay-rednote-card").length;
    const previewHeight = Math.round(PREVIEW_WIDTH * REDNOTE_IMAGE_SIZE.height / REDNOTE_IMAGE_SIZE.width);
    const card = this.createCard("", total, Number(sectionIndex), context, previewHeight);
    card.classList.remove("is-active");
    const sourceHeading = current.querySelector<HTMLElement>(".noterelay-card-content > h1, .noterelay-card-content > h2");
    const target = card.querySelector<HTMLElement>(".noterelay-card-content");
    if (sourceHeading && target) {
      const heading = sourceHeading.cloneNode(true) as HTMLElement;
      const sectionCards = Array.from(host.querySelectorAll<HTMLElement>(`.noterelay-rednote-card[data-section-index="${sectionIndex}"]`));
      const baseTitle = (sourceHeading.textContent || "").replace(/（续(?:\s*\d+)?）$/, "");
      heading.textContent = `${baseTitle}（续${sectionCards.length > 1 ? ` ${sectionCards.length}` : ""}）`;
      target.appendChild(heading);
    }
    host.insertBefore(card, next);
    return card;
  }

  private async renderCardPng(card: HTMLElement, context: RenderContext): Promise<string> {
    const wasActive = card.classList.contains("is-active");
    const selectedImages = Array.from(card.querySelectorAll<HTMLImageElement>("[data-noterelay-selected]"));
    selectedImages.forEach((image) => image.removeAttribute("data-noterelay-selected"));
    card.classList.add("is-active");
    let restoreImages: () => void = () => {};
    try {
      await waitForImages(card, context.signal);
      context.signal?.throwIfAborted();
      restoreImages = await inlineImagesForExport(card, context);
      context.signal?.throwIfAborted();
      const exportWidth = Number(card.dataset.exportWidth || PREVIEW_WIDTH);
      return await toPng(card, {
        pixelRatio: exportWidth / PREVIEW_WIDTH,
        cacheBust: false,
        backgroundColor: context.theme.tokens.background,
        imagePlaceholder: TRANSPARENT_PIXEL,
        onImageErrorHandler: () => undefined,
        filter: (node) => !((node instanceof HTMLElement) && node.hasAttribute("data-rednote-copy"))
      });
    } finally {
      restoreImages();
      selectedImages.forEach((image) => image.setAttribute("data-noterelay-selected", ""));
      card.classList.toggle("is-active", wasActive);
    }
  }

  private updateNavigation(nav: HTMLElement, active: number, total: number): void {
    const prev = nav.querySelector<HTMLButtonElement>("button[data-direction=prev]");
    const next = nav.querySelector<HTMLButtonElement>("button[data-direction=next]");
    if (prev) prev.disabled = active <= 0;
    if (next) next.disabled = active >= total - 1;
  }

  private attachImageControls(root: HTMLElement, context: RenderContext): void {
    const images = Array.from(root.querySelectorAll<HTMLImageElement>(".noterelay-card-content img[data-noterelay-image-key]"));
    if (!images.length) return;
    images.forEach((image) => image.classList.add("is-adjustable-image"));

    const controls = createDiv({ cls: "noterelay-image-controls" });
    appendSpan(controls, { cls: "noterelay-image-controls-label", text: "图片" });
    const selector = appendEl(controls, "select", { attr: { "aria-label": "选择正文图片", "data-rednote-image-select": "true" } });
    images.forEach((image, index) => {
      const source = image.dataset.noterelaySource || image.alt || `图片 ${index + 1}`;
      const filename = source.split(/[\\/]/).pop()?.replace(/[?#].*$/, "") || `图片 ${index + 1}`;
      appendEl(selector, "option", { value: image.dataset.noterelayImageKey || "", text: `${index + 1}. ${image.alt || filename}` });
    });
    const autoButton = appendEl(controls, "button", { text: "自适应", attr: { type: "button" } });
    const presets = [50, 75, 100].map((width) => appendEl(controls, "button", { text: `${width}%`, attr: { type: "button", "data-image-width": String(width) } }));
    appendSpan(controls, { cls: "noterelay-image-control-row-label", text: "宽度" });
    const slider = appendEl(controls, "input", { type: "range", attr: { min: "30", max: "100", step: "5", "aria-label": "图片宽度" } });
    const value = appendSpan(controls, { cls: "noterelay-image-width-value" });
    appendSpan(controls, { cls: "noterelay-image-control-row-label", text: "圆角" });
    const radiusSlider = appendEl(controls, "input", { type: "range", attr: { min: "0", max: "32", step: "1", "aria-label": "图片圆角" } });
    const radiusValue = appendSpan(controls, { cls: "noterelay-image-radius-value" });
    root.appendChild(controls);

    const noteOverrides = () => context.notePath ? context.settings.rednoteImageWidths[context.notePath] : undefined;
    const noteRadii = () => context.notePath ? context.settings.rednoteImageRadii[context.notePath] : undefined;
    const selectedImage = () => root.querySelector<HTMLImageElement>(`.noterelay-card-content img[data-noterelay-image-key="${CSS.escape(selector.value)}"]`);
    const measuredWidths = new Map<string, number>();
    const updateWidthStatus = () => {
      const image = selectedImage();
      if (!image) return;
      const requested = noteOverrides()?.[selector.value];
      const actual = this.effectiveImageWidth(image);
      if (actual !== undefined) measuredWidths.set(selector.value, actual);
      const displayedActual = actual ?? measuredWidths.get(selector.value);
      if (typeof requested === "number" && Number.isFinite(requested)) {
        slider.value = String(requested);
        value.textContent = displayedActual !== undefined && Math.abs(displayedActual - requested) >= 2
          ? `${requested}% · 实际 ${displayedActual}%`
          : `${requested}%`;
      } else {
        if (displayedActual !== undefined) slider.value = String(displayedActual);
        value.textContent = displayedActual !== undefined ? `自适应 · ${displayedActual}%` : "自适应";
      }
    };
    const scheduleWidthStatus = () => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(updateWidthStatus));
    };
    const selectImage = (imageKey: string) => {
      selector.value = imageKey;
      images.forEach((image) => image.toggleAttribute("data-noterelay-selected", image.dataset.noterelayImageKey === imageKey));
      updateWidthStatus();
      const radius = noteRadii()?.[imageKey] ?? 0;
      radiusSlider.value = String(radius);
      radiusValue.textContent = `${radius}px`;
    };
    const previewWidth = (width?: number) => {
      const image = selectedImage();
      if (!image) return;
      if (width === undefined) this.applyImageWidth(image);
      else this.applyImageWidth(image, width);
      value.textContent = width === undefined ? "自适应" : `${width}%`;
    };
    const commitWidth = (width?: number) => {
      const save = context.onRednoteImageWidthChange?.(selector.value, width);
      if (save) void save.then(scheduleWidthStatus, scheduleWidthStatus);
      else scheduleWidthStatus();
    };
    const previewRadius = (radius: number) => {
      const image = selectedImage();
      if (!image) return;
      this.applyImageRadius(image, radius);
      radiusValue.textContent = `${radius}px`;
    };
    const commitRadius = (radius: number) => void context.onRednoteImageRadiusChange?.(selector.value, radius);

    images.forEach((image) => image.addEventListener("click", () => {
      selectImage(image.dataset.noterelayImageKey || "");
      this.revealImage(root, image.dataset.noterelayImageKey || "");
      scheduleWidthStatus();
    }));
    selector.addEventListener("change", () => {
      selectImage(selector.value);
      this.revealImage(root, selector.value);
      scheduleWidthStatus();
    });
    autoButton.addEventListener("click", () => { previewWidth(); commitWidth(); });
    presets.forEach((button) => button.addEventListener("click", () => {
      const width = Number(button.dataset.imageWidth);
      slider.value = String(width);
      previewWidth(width);
      commitWidth(width);
    }));
    slider.addEventListener("input", () => previewWidth(Number(slider.value)));
    slider.addEventListener("change", () => commitWidth(Number(slider.value)));
    radiusSlider.addEventListener("input", () => previewRadius(Number(radiusSlider.value)));
    radiusSlider.addEventListener("change", () => commitRadius(Number(radiusSlider.value)));
    images.forEach((image) => {
      image.addEventListener("load", scheduleWidthStatus, { once: true });
      if (image.complete) scheduleWidthStatus();
    });
    root.addEventListener("noterelay-rednote-layout", scheduleWidthStatus);
    const initialImageKey = context.rednoteFocusImageKey && images.some((image) => image.dataset.noterelayImageKey === context.rednoteFocusImageKey)
      ? context.rednoteFocusImageKey
      : images[0].dataset.noterelayImageKey || "";
    selectImage(initialImageKey);
    this.revealImage(root, initialImageKey);
    scheduleWidthStatus();
  }

  private applyImageWidth(image: HTMLImageElement, width?: number): void {
    if (width === undefined) {
      image.style.removeProperty("--nr-image-width");
      image.classList.remove("has-custom-size");
      return;
    }
    setCssProps(image, { "--nr-image-width": `${Math.max(30, Math.min(100, width))}%` });
    image.classList.add("has-custom-size");
  }

  private applyImageRadius(image: HTMLImageElement, radius: number): void {
    setCssProps(image, { "--nr-image-radius": `${Math.max(0, Math.min(32, radius))}px` });
  }

  private effectiveImageWidth(image: HTMLImageElement): number | undefined {
    const content = image.closest<HTMLElement>(".noterelay-card-content");
    const imageWidth = image.getBoundingClientRect().width;
    const contentWidth = content?.getBoundingClientRect().width ?? 0;
    if (imageWidth <= 0 || contentWidth <= 0) return undefined;
    return Math.max(1, Math.min(100, Math.round(imageWidth / contentWidth * 100)));
  }

  revealImage(root: HTMLElement, imageKey: string): void {
    const image = root.querySelector<HTMLImageElement>(`.noterelay-card-content img[data-noterelay-image-key="${CSS.escape(imageKey)}"]`);
    const card = image?.closest<HTMLElement>(".noterelay-rednote-card");
    if (!card) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".noterelay-rednote-card"));
    const active = cards.indexOf(card);
    if (active < 0) return;
    root.dataset.activeIndex = String(active);
    cards.forEach((item, index) => item.classList.toggle("is-active", index === active));
    const nav = root.querySelector<HTMLElement>(".noterelay-card-nav");
    const label = nav?.querySelector("span");
    if (label) label.textContent = `${active + 1} / ${cards.length}`;
    if (nav) this.updateNavigation(nav, active, cards.length);
  }
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function renderCardHeader(template: RednoteTemplateId, name: string, handle: string, avatarUrl: string): string {
  if (template === "notes") return `<header class="red-preview-header red-notes-header"><section class="red-notes-bar"><span class="red-notes-title"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>备忘录</span></span><span class="red-notes-actions"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg></span><span class="red-notes-more"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></span></section></header>`;
  const avatar = avatarUrl ? `<img src="${escapeAttr(avatarUrl)}" alt="用户头像">` : `<span class="red-avatar-placeholder"><span class="red-avatar-upload-icon">📷</span></span>`;
  const userId = handle.trim() ? `<small class="red-user-id">${escapeHtml(handle.trim())}</small>` : "";
  return `<header class="red-preview-header"><section class="red-user-info"><section class="red-user-left"><span class="red-user-avatar">${avatar}</span><span class="red-user-meta${userId ? "" : " is-name-only"}"><span class="red-user-name-container"><strong class="red-user-name">${escapeHtml(name)}</strong><span class="red-verified-icon">✓</span></span>${userId}</span></section><span class="red-user-right"><small class="red-post-time">${escapeHtml(new Date().toLocaleDateString("zh-CN"))}</small></span></section></header>`;
}

function renderCardFooter(template: RednoteTemplateId, left: string, right: string, authorName: string): string {
  if (template === "notes") return `<footer class="red-preview-footer red-notes-footer"><span class="red-notes-author">${escapeHtml(authorName)}</span></footer>`;
  return `<footer class="red-preview-footer"><span class="red-footer-text">${escapeHtml(left)}</span><span class="red-footer-separator">|</span><span class="red-footer-text">${escapeHtml(right)}</span></footer>`;
}

function copyIconButton(): string {
  return `<button type="button" class="red-copy-button" data-rednote-copy aria-label="复制图片到剪贴板" title="复制图片"><svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="#9b9b9b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" fill="none" stroke="#9b9b9b" stroke-width="4" stroke-linejoin="round"/></svg></button>`;
}

function renderCardBackground(image: string, scale: number, position: { x: number; y: number }): string {
  if (!image) return "";
  const safeImage = escapeAttr(image);
  const safeScale = Math.max(1, Math.min(2, scale));
  const x = Number.isFinite(position.x) ? position.x : 0;
  const y = Number.isFinite(position.y) ? position.y : 0;
  return `<span class="red-card-background" style="background-image:url(&quot;${safeImage}&quot;);transform:translate(${x}px,${y}px) scale(${safeScale})"></span>`;
}

async function downloadDataUrl(dataUrl: string, filename: string, context: RenderContext): Promise<void> { context.signal?.throwIfAborted(); if (!context.onDeliver) throw new Error("交付请求已失效"); context.onDeliver(png(dataUrl,filename)); }
async function downloadBlob(blob: Blob, filename: string, context: RenderContext): Promise<void> { context.signal?.throwIfAborted(); if (!context.onDeliver) throw new Error("交付请求已失效"); context.onDeliver({blob,filename}); }

async function waitForImages(root: HTMLElement, signal?: AbortSignal): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
    await Promise.all(images.map(async (image) => {
    if (image.complete) return;
    await Promise.race([
      abortable(image.decode().catch(() => undefined), signal),
      new Promise<void>((resolve) => { const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); }; const timer = window.setTimeout(done, 3000); signal?.addEventListener("abort", done, {once: true}); })
    ]);
  }));
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('已切换稿件'));
    signal.addEventListener('abort', abort, {once: true});
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)).catch(() => undefined);
  });
}

async function inlineImagesForExport(root: HTMLElement, context: RenderContext): Promise<() => void> {
  const changed: Array<{ image: HTMLImageElement; src: string }> = [];
  try {
    for (const image of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
      const originalSrc = image.src;
      if (!originalSrc || originalSrc.startsWith("data:")) continue;
      const source = image.dataset.noterelaySource || originalSrc;
      let dataUrl: string | undefined;
      try { dataUrl = await context.resolveImageDataUrl?.(source); } catch { /* Fall through to browser conversion. */ }
      if (!dataUrl) {
        try { dataUrl = await fetchImageAsDataUrl(originalSrc); } catch { /* Try the already-rendered pixels next. */ }
      }
      if (!dataUrl) {
        try { dataUrl = imageToCanvasDataUrl(image); } catch { /* Use avatar fallback or report below. */ }
      }
      const isAvatar = Boolean(image.closest(".red-user-avatar"));
      if (!dataUrl && isAvatar) dataUrl = TRANSPARENT_PIXEL;
      if (!dataUrl) throw new Error(`正文图片无法写入导出文件：${image.alt || source}`);
      changed.push({ image, src: originalSrc });
      image.src = dataUrl;
      await image.decode().catch(() => undefined);
    }
  } catch (error) {
    changed.forEach(({ image, src }) => { image.src = src; });
    throw error;
  }
  return () => changed.forEach(({ image, src }) => { image.src = src; });
}

async function fetchImageAsDataUrl(src: string): Promise<string | undefined> {
  const response = await requestUrl({ url: src, method: "GET" });
  if (response.status < 200 || response.status >= 300) return undefined;
  const type = response.headers["content-type"] ?? "image/png";
  return blobToDataUrl(new Blob([response.arrayBuffer], { type }));
}

function imageToCanvasDataUrl(image: HTMLImageElement): string | undefined {
  if (!image.naturalWidth || !image.naturalHeight) return undefined;
  const canvas = createEl("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "小红书卡片";
}
