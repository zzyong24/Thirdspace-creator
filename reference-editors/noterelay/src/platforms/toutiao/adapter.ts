import MarkdownIt from "markdown-it";
import { replaceAccountVariables } from "../../core/accountVariables";
import { copyRichHtml } from "../../core/clipboard";
import { createSanitizedHost, setSanitizedHtml } from "../../core/dom";
import type { RenderContext } from "../../types";
import type { PlatformAdapter } from "../platform";

interface ToutiaoRenderResult {
  html: string;
  plainText: string;
  hasLocalImages: boolean;
}

const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });

export class ToutiaoAdapter implements PlatformAdapter {
  id = "toutiao" as const;
  label = "头条号";

  render(context: RenderContext): HTMLElement {
    const result = renderToutiaoArticle(context);
    const root = createEl("article");
    root.className = "noterelay-toutiao";
    if (result.hasLocalImages) {
      const warning = createEl("aside");
      warning.className = "noterelay-toutiao-warning";
      warning.textContent = "文章包含本地图片，复制时会将可读取的图片一并写入。";
      root.appendChild(warning);
    }
    const preview = createDiv();
    preview.className = "noterelay-toutiao-preview";
    setSanitizedHtml(preview, result.html);
    root.appendChild(preview);
    return root;
  }

  async copy(context: RenderContext): Promise<string> {
    const result = renderToutiaoArticle(context);
    const html = await inlineLocalImages(result.html, context);
    await copyRichHtml(html, result.plainText);
    return "头条号文章已复制";
  }
}

function renderToutiaoArticle(context: RenderContext): ToutiaoRenderResult {
  const source = replaceAccountVariables(context.note.markdown, context.account);
  const host = createSanitizedHost(markdown.render(source), "article");
  host.className = "tt-article";
  normalizeTaskLists(host);
  normalizeCodeBlocks(host);

  let hasLocalImages = false;
  for (const image of Array.from(host.querySelectorAll<HTMLImageElement>("img"))) {
    const sourcePath = image.getAttribute("src") ?? "";
    image.dataset.noterelaySource = sourcePath;
    if (!/^(?:https?:|data:|blob:|app:)/i.test(sourcePath)) hasLocalImages = true;
    image.src = context.resolveImageSrc?.(sourcePath) ?? sourcePath;
    image.loading = "eager";
  }

  if (context.account?.signature.trim()) {
    const signature = createEl("p");
    signature.className = "tt-signature";
    signature.textContent = context.account.signature.trim();
    host.appendChild(signature);
  }

  applyToutiaoStyles(host, context);
  const plainText = htmlToPlainText(host);
  return { html: host.outerHTML, plainText, hasLocalImages };
}

function normalizeTaskLists(host: HTMLElement): void {
  for (const list of Array.from(host.querySelectorAll<HTMLUListElement>("ul"))) {
    const items = Array.from(list.children).filter((child): child is HTMLLIElement => child.instanceOf(HTMLLIElement));
    if (!items.length) continue;
    const taskItems = items.map((item) => normalizeTaskMarker(item));
    if (!taskItems.every(Boolean)) continue;
    const fragment = createFragment();
    for (const item of items) {
      const paragraph = createEl("p");
      while (item.firstChild) paragraph.appendChild(item.firstChild);
      fragment.appendChild(paragraph);
    }
    list.replaceWith(fragment);
  }
}

function normalizeTaskMarker(item: HTMLLIElement): boolean {
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const match = node.textContent?.match(/^\s*\[([ xX])\]\s*/);
    if (match) {
      node.textContent = `${match[1]?.toLowerCase() === "x" ? "☑" : "☐"} ${(node.textContent ?? "").slice(match[0].length)}`;
      return true;
    }
    if (node.textContent?.trim()) return false;
    node = walker.nextNode();
  }
  return false;
}

function normalizeCodeBlocks(host: HTMLElement): void {
  for (const code of Array.from(host.querySelectorAll<HTMLElement>("pre > code"))) {
    const lines = (code.textContent ?? "").replace(/\n$/, "").split("\n");
    code.empty();
    lines.forEach((line, index) => {
      code.appendText(line || "\u00a0");
      if (index < lines.length - 1) code.appendChild(createEl("br"));
    });
  }
}

function applyToutiaoStyles(host: HTMLElement, context: RenderContext): void {
  const tokens = context.theme.tokens;
  setStyles(host, {
    fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif",
    color: tokens.text,
    background: tokens.background,
    overflowWrap: "break-word",
    fontSize: "17px",
    lineHeight: "1.75"
  });
  styleAll(host, "h1,h2,h3,h4,h5,h6", { fontWeight: "700", margin: "1.4em 0 .7em", lineHeight: "1.35" });
  styleAll(host, "h1", { color: tokens.text, fontSize: "24px" });
  styleAll(host, "h2", { color: tokens.text, fontSize: "20px" });
  styleAll(host, "h3", { color: tokens.text, fontSize: "18px" });
  styleAll(host, "h4,h5,h6", { fontSize: "16px" });
  styleAll(host, "p", { margin: ".8em 0", textAlign: "justify" });
  styleAll(host, "ul,ol", { margin: ".8em 0", paddingLeft: "1.6em", textAlign: "left" });
  styleAll(host, "li", { margin: ".3em 0", textAlign: "left" });
  styleAll(host, "blockquote", { borderLeft: `3px solid ${tokens.border}`, padding: "8px 14px", margin: "12px 0", background: tokens.surface, color: tokens.muted });
  styleAll(host, "blockquote p", { margin: "0" });
  styleAll(host, "hr", { border: "0", borderTop: `1px solid ${tokens.border}`, margin: "20px 0" });
  styleAll(host, "table", { borderCollapse: "collapse", width: "100%", margin: "12px 0", fontSize: ".95em" });
  styleAll(host, "th,td", { border: `1px solid ${tokens.border}`, padding: "6px 10px" });
  styleAll(host, "th", { background: tokens.surface, fontWeight: "700" });
  styleAll(host, "img", { display: "block", maxWidth: "100%", height: "auto", margin: "12px auto" });
  styleAll(host, "pre", { whiteSpace: "pre-wrap", wordBreak: "break-all", background: tokens.surface, color: tokens.text, border: `1px solid ${tokens.border}`, padding: "14px", overflowX: "auto", fontSize: "14px", lineHeight: "1.55", margin: "12px 0", fontFamily: "'SFMono-Regular',Consolas,'Liberation Mono',monospace" });
  styleAll(host, "pre code", { whiteSpace: "pre-wrap", background: "transparent", color: tokens.text, padding: "0", fontFamily: "'SFMono-Regular',Consolas,'Liberation Mono',monospace" });
  styleAll(host, ":not(pre) > code", { background: tokens.surface, color: tokens.text, padding: "1px 5px", fontSize: ".9em", fontFamily: "'SFMono-Regular',Consolas,'Liberation Mono',monospace" });
  styleAll(host, "a", { color: tokens.accent, textDecoration: "underline" });
  styleAll(host, ".tt-signature", { marginTop: "2em", color: tokens.muted, fontSize: "15px", whiteSpace: "pre-wrap" });
}

function styleAll(host: HTMLElement, selector: string, styles: Partial<CSSStyleDeclaration>): void {
  host.querySelectorAll<HTMLElement>(selector).forEach((node) => setStyles(node, styles));
}

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(element.style, styles);
}

async function inlineLocalImages(html: string, context: RenderContext): Promise<string> {
  const host = createSanitizedHost(html);
  for (const image of Array.from(host.querySelectorAll<HTMLImageElement>("img"))) {
    const source = image.dataset.noterelaySource ?? image.getAttribute("src") ?? "";
    if (!source || /^(?:https?:|data:)/i.test(source)) {
      image.removeAttribute("data-noterelay-source");
      continue;
    }
    const dataUrl = await context.resolveImageDataUrl?.(source);
    if (!dataUrl) throw new Error(`无法读取本地图片：${source}`);
    image.src = dataUrl;
    image.removeAttribute("data-noterelay-source");
  }
  return host.innerHTML;
}

function htmlToPlainText(host: HTMLElement): string {
  const clone = host.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("h1,h2,h3,h4,h5,h6,p,blockquote,li,pre,tr").forEach((node) => node.append("\n"));
  return (clone.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
