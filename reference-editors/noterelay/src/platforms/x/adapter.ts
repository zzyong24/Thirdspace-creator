import MarkdownIt from "markdown-it";
import { replaceAccountVariables } from "../../core/accountVariables";
import { copyRichHtml } from "../../core/clipboard";
import { createSanitizedHost, setSanitizedHtml } from "../../core/dom";
import { escapeHtml } from "../../core/html";
import type { RenderContext } from "../../types";
import type { PlatformAdapter } from "../platform";

interface XMediaItem {
  type: "图片" | "GIF" | "视频" | "X 帖子";
  label: string;
  source: string;
}

interface XArticleResult {
  html: string;
  plainText: string;
  media: XMediaItem[];
}

const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });
const defaultImageRenderer = markdown.renderer.rules.image ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
markdown.renderer.rules.image = (tokens, index, options, env: { mode?: "preview" | "copy"; resolveImageSrc?: (src: string) => string }, self) => {
  const token = tokens[index];
  const raw = token.attrGet("src") ?? "";
  const alt = token.content || "文章图片";
  if (env.mode === "copy") {
    return `<p class="noterelay-x-media-marker"><em>[请在 X 编辑器此处插入图片：${escapeHtml(alt)}；来源：${escapeHtml(raw)}]</em></p>`;
  }
  token.attrSet("src", env.resolveImageSrc?.(raw) ?? raw);
  token.attrSet("loading", "eager");
  return `<figure class="noterelay-x-figure">${defaultImageRenderer(tokens, index, options, env, self)}${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ""}</figure>`;
};

export class XAdapter implements PlatformAdapter {
  id = "x" as const;
  label = "X";

  render(context: RenderContext): HTMLElement {
    const result = buildXArticle(context, "preview");
    const root = createEl("article");
    const tokens = context.theme.tokens;
    root.className = "noterelay-x noterelay-themed";
    root.setCssProps({
      "--nr-x-width": `${tokens.contentWidth}px`, "--nr-x-radius": `${tokens.radius}px`,
      "--nr-x-surface": tokens.surface, "--nr-x-text": tokens.text, "--nr-x-font": tokens.fontFamily,
      "--nr-x-font-size": `${tokens.baseFontSize}px`, "--nr-x-line-height": String(tokens.lineHeight),
      "--nr-x-muted": tokens.muted, "--nr-x-border": tokens.border, "--nr-x-accent": tokens.accent
    });

    const meta = createEl("header");
    meta.className = "noterelay-x-account";
    meta.textContent = `${context.account?.name ?? "未选择账号"}${context.account?.handle ? `  ${context.account.handle}` : ""}`;
    const content = createEl("section");
    content.className = "noterelay-x-article";
    setSanitizedHtml(content, result.html);
    root.append(meta, content);

    const mediaPanel = createEl("aside");
    mediaPanel.className = "noterelay-x-media-panel";
    const title = createEl("strong");
    title.textContent = result.media.length ? `媒体清单 · ${result.media.length} 项需在 X 中原生添加` : "未检测到需要单独添加的媒体";
    mediaPanel.appendChild(title);
    if (result.media.length) {
      const list = createEl("ol");
      for (const item of result.media) {
        const row = createEl("li");
        row.textContent = `${item.type} · ${item.label} · ${item.source}`;
        list.appendChild(row);
      }
      mediaPanel.appendChild(list);
    }
    root.appendChild(mediaPanel);
    return root;
  }

  async copy(context: RenderContext): Promise<string> {
    const result = buildXArticle(context, "copy");
    await copyRichHtml(result.html, result.plainText);
    return result.media.length
      ? `X 长文格式已复制；${result.media.length} 项媒体请按标记在 X 编辑器中原生添加`
      : "X 长文格式已复制";
  }
}

function buildXArticle(context: RenderContext, mode: "preview" | "copy"): XArticleResult {
  const source = prepareMarkdown(replaceAccountVariables(context.note.markdown, context.account), context.note.title, context.settings.xIncludeTitle);
  const media = collectMedia(source);
  let html = markdown.render(source, { mode, resolveImageSrc: context.resolveImageSrc });
  html = convertTablesToLists(html);
  if (context.account?.signature.trim()) html += `<p class="noterelay-x-signature">${escapeHtml(context.account.signature.trim())}</p>`;
  html = applyCopySafeStructure(html);
  return { html, plainText: htmlToPlainText(html), media };
}

function prepareMarkdown(markdownSource: string, fallbackTitle: string, includeTitle: boolean): string {
  const titlePattern = /^ {0,3}#(?!#)[ \t]+.+(?:\n|$)/;
  const hasTitle = titlePattern.test(markdownSource);
  if (!includeTitle) return markdownSource.replace(titlePattern, "").trim();
  return hasTitle ? markdownSource.trim() : `# ${fallbackTitle}\n\n${markdownSource.trim()}`;
}

function collectMedia(source: string): XMediaItem[] {
  const items: XMediaItem[] = [];
  for (const match of source.matchAll(/!\[([^\]]*)\]\((?:<)?([^\s)>]+)(?:>)?(?:\s+["'][^"']*["'])?\)/g)) {
    const path = match[2] ?? "";
    items.push({ type: /\.gif(?:$|[?#])/i.test(path) ? "GIF" : "图片", label: match[1] || "未命名图片", source: path });
  }
  for (const match of source.matchAll(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^\s)]+\/status\/\d+/gi)) {
    items.push({ type: "X 帖子", label: "嵌入帖子", source: match[0] });
  }
  for (const match of source.matchAll(/(?:^|\s)(\S+\.(?:mp4|mov|webm))(?:\s|$)/gim)) {
    items.push({ type: "视频", label: "视频", source: match[1] ?? "" });
  }
  return uniqueMedia(items);
}

function uniqueMedia(items: XMediaItem[]): XMediaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function convertTablesToLists(html: string): string {
  const host = createSanitizedHost(html);
  for (const table of Array.from(host.querySelectorAll("table"))) {
    const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cell.textContent?.trim() || "项目");
    const list = createEl("ul");
    for (const row of Array.from(table.querySelectorAll("tbody tr"))) {
      const values = Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent?.trim() || "");
      const item = createEl("li");
      values.forEach((value, index) => {
        if (index) item.appendText(" · ");
        item.createEl("strong", { text: `${headers[index] || `字段 ${index + 1}`}：` });
        item.appendText(value);
      });
      list.appendChild(item);
    }
    table.replaceWith(list);
  }
  return host.innerHTML;
}

function applyCopySafeStructure(html: string): string {
  const host = createSanitizedHost(html, "article");
  host.querySelectorAll<HTMLElement>("h1").forEach((node) => node.setCssStyles({ fontSize: "32px", lineHeight: "1.2", margin: "0 0 20px", fontWeight: "700" }));
  host.querySelectorAll<HTMLElement>("h2").forEach((node) => node.setCssStyles({ fontSize: "24px", lineHeight: "1.3", margin: "28px 0 12px", fontWeight: "700" }));
  host.querySelectorAll<HTMLElement>("h3").forEach((node) => node.setCssStyles({ fontSize: "19px", lineHeight: "1.35", margin: "22px 0 10px", fontWeight: "700" }));
  host.querySelectorAll<HTMLElement>("p").forEach((node) => node.setCssStyles({ margin: "0 0 14px", lineHeight: "1.65" }));
  host.querySelectorAll<HTMLElement>("ul,ol").forEach((node) => node.setCssStyles({ margin: "0 0 16px", paddingLeft: "24px" }));
  host.querySelectorAll<HTMLElement>("li").forEach((node) => node.setCssStyles({ margin: "0 0 7px", lineHeight: "1.55" }));
  host.querySelectorAll<HTMLElement>("blockquote").forEach((node) => node.setCssStyles({ margin: "16px 0", padding: "2px 0 2px 16px", borderLeft: "3px solid #8b98a5" }));
  host.querySelectorAll<HTMLElement>("a").forEach((node) => node.setCssStyles({ color: "#1d9bf0", textDecoration: "underline" }));
  host.querySelectorAll<HTMLElement>("figure").forEach((node) => node.setCssStyles({ margin: "18px 0" }));
  host.querySelectorAll<HTMLElement>("img").forEach((node) => node.setCssStyles({ display: "block", maxWidth: "100%", height: "auto" }));
  return host.innerHTML;
}

function htmlToPlainText(html: string): string {
  const host = createSanitizedHost(html);
  host.querySelectorAll("h1,h2,h3,p,blockquote,li,figure").forEach((node) => node.append("\n"));
  return (host.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
