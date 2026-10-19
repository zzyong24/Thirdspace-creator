import type { Frontmatter, ParsedBlock } from "./types";

import MarkdownIt from "markdown-it";

export interface ParsedMarkdown {
  frontmatter: Frontmatter;
  blocks: ParsedBlock[];
}

type MdToken = {
  type: string;
  tag: string;
  nesting: number;
  content: string;
  attrs: [string, string][] | null;
  children: MdToken[] | null;
  markup?: string;
  info?: string;
  attrGet?: (name: string) => string | null;
};

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false,
  breaks: false
});

export function parseMarkdown(input: string): ParsedMarkdown {
  const { frontmatter, body } = extractFrontmatter(preprocessMarkdown(input.replace(/\r\n?/g, "\n")));
  const normalizedBody = normalizeObsidianSyntax(body);
  const tokens = md.parse(normalizedBody, {}) as MdToken[];
  return { frontmatter, blocks: tokensToBlocks(tokens) };
}

function tokensToBlocks(tokens: MdToken[]): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.type === "heading_open") {
      const inlineToken = tokens[index + 1];
      blocks.push({
        type: "heading",
        level: Number(token.tag.replace("h", "")) || 2,
        text: inlineToken?.content?.trim() || "",
        html: renderInline(inlineToken?.content || "")
      });
      index += 3;
      continue;
    }

    if (token.type === "paragraph_open") {
      const inlineToken = tokens[index + 1];
      const image = singleImageFromInline(inlineToken);
      if (image) {
        blocks.push(image);
      } else if (inlineToken?.content?.trim()) {
        blocks.push({ type: "paragraph", text: inlineToken.content.trim(), html: renderInline(inlineToken.content) });
      }
      index = skipUntil(tokens, index, "paragraph_close") + 1;
      continue;
    }

    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      const end = findMatchingClose(tokens, index);
      blocks.push(parseList(tokens.slice(index, end + 1), token.type === "ordered_list_open"));
      index = end + 1;
      continue;
    }

    if (token.type === "blockquote_open") {
      const end = findMatchingClose(tokens, index);
      blocks.push(parseQuoteOrCallout(tokens.slice(index + 1, end)));
      index = end + 1;
      continue;
    }

    if (token.type === "fence" || token.type === "code_block") {
      blocks.push({
        type: "code",
        language: (token.info || "").trim().split(/\s+/)[0] || "",
        code: token.content.replace(/\n$/, "")
      });
      index++;
      continue;
    }

    if (token.type === "table_open") {
      const end = findMatchingClose(tokens, index);
      blocks.push(parseTable(tokens.slice(index, end + 1)));
      index = end + 1;
      continue;
    }

    if (token.type === "hr") {
      blocks.push({ type: "rule" });
      index++;
      continue;
    }

    index++;
  }

  return blocks;
}

function parseList(tokens: MdToken[], ordered: boolean): ParsedBlock {
  const items: Array<{ text: string; html?: string; checked?: boolean }> = [];
  let depth = 0;
  let currentText: string[] = [];
  let currentHtml: string[] = [];

  const flush = (): void => {
    const text = currentText.join(" ").replace(/\s+/g, " ").trim();
    const html = currentHtml.join("<br>").trim();
    if (!text && !html) return;
    const task = text.match(/^\[([ xX])]\s+(.+)$/);
    items.push(task
      ? { text: task[2].trim(), html: stripTaskMarker(html), checked: task[1].toLowerCase() === "x" }
      : { text, html });
    currentText = [];
    currentHtml = [];
  };

  for (const token of tokens) {
    if (token.type === "list_item_open") {
      if (depth === 0) flush();
      depth++;
      continue;
    }
    if (token.type === "list_item_close") {
      depth--;
      if (depth === 0) flush();
      continue;
    }
    if (depth > 0 && token.type === "inline") {
      currentText.push(token.content);
      currentHtml.push(renderInline(token.content));
    }
  }

  flush();
  return { type: "list", ordered, items };
}

function parseQuoteOrCallout(tokens: MdToken[]): ParsedBlock {
  const lines = tokens
    .filter((token) => token.type === "inline")
    .flatMap((token) => token.content.split("\n").map((line) => line.trim()))
    .filter(Boolean);
  const first = lines[0] ?? "";
  const callout = first.match(/^\[!([\w-]+)]\s*([+-])?\s*(.*)$/);
  if (!callout) {
    return { type: "quote", text: lines.join("\n"), html: lines.map(renderInline).join("<br>") };
  }

  const kind = callout[1].toLowerCase();
  const title = callout[3]?.trim() || undefined;
  const attrs: Record<string, string> = {};
  const bodyLines: string[] = [];
  for (const line of lines.slice(1)) {
    const attr = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/);
    if (attr) {
      attrs[attr[1]] = stripQuotes(attr[2].trim());
    } else {
      bodyLines.push(line);
    }
  }
  return { type: "callout", kind, title, attrs, body: bodyLines.join("\n").trim(), bodyHtml: bodyLines.map(renderInline).join("<br>") };
}

function parseTable(tokens: MdToken[]): ParsedBlock {
  const headers: string[] = [];
  const headerHtml: string[] = [];
  const rows: string[][] = [];
  const rowsHtml: string[][] = [];
  let inHead = false;
  let inBody = false;
  let currentRow: string[] = [];
  let currentRowHtml: string[] = [];

  for (const token of tokens) {
    if (token.type === "thead_open") inHead = true;
    if (token.type === "thead_close") inHead = false;
    if (token.type === "tbody_open") inBody = true;
    if (token.type === "tbody_close") inBody = false;
    if (token.type === "tr_open") {
      currentRow = [];
      currentRowHtml = [];
    }
    if (token.type === "inline") {
      if (inHead) {
        headers.push(token.content);
        headerHtml.push(renderInline(token.content));
      } else if (inBody) {
        currentRow.push(token.content);
        currentRowHtml.push(renderInline(token.content));
      }
    }
    if (token.type === "tr_close" && currentRow.length) {
      rows.push(currentRow);
      rowsHtml.push(currentRowHtml);
    }
  }

  return { type: "table", headers, rows, headerHtml, rowsHtml };
}

function singleImageFromInline(token: MdToken | undefined): ParsedBlock | undefined {
  const children = token?.children ?? [];
  const meaningful = children.filter((child) => child.type !== "softbreak" && child.type !== "hardbreak" && child.content.trim());
  const images = children.filter((child) => child.type === "image");
  if (images.length !== 1) return undefined;
  const image = images[0];
  const nonImageText = meaningful.filter((child) => child.type !== "image").map((child) => child.content).join(" ").trim();
  if (meaningful.length > 1 && !nonImageText) return undefined;
  if (meaningful.length > 1 && nonImageText && !token?.content.includes(image.attrGet?.("src") || "")) return undefined;
  return {
    type: "image",
    src: image.attrGet?.("src") || attrGet(image, "src") || "",
    alt: image.content || attrGet(image, "alt") || "image",
    caption: nonImageText || undefined
  };
}

function renderInline(content: string): string {
  return md.renderInline(content);
}

function stripTaskMarker(html: string): string {
  return html.replace(/^\[[ xX]\]\s+/, "");
}

function skipUntil(tokens: MdToken[], start: number, closeType: string): number {
  for (let index = start + 1; index < tokens.length; index++) {
    if (tokens[index].type === closeType) return index;
  }
  return start;
}

function findMatchingClose(tokens: MdToken[], start: number): number {
  const open = tokens[start];
  const closeType = open.type.replace(/_open$/, "_close");
  let depth = 0;
  for (let index = start; index < tokens.length; index++) {
    if (tokens[index].type === open.type) depth++;
    if (tokens[index].type === closeType) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return start;
}

function attrGet(token: MdToken, name: string): string | undefined {
  return token.attrs?.find(([key]) => key === name)?.[1];
}

function preprocessMarkdown(input: string): string {
  return input
    .replace(/^[ ]{0,3}(\*[ ]*\*[ ]*\*[* ]*)[ \t]*$/gm, "***")
    .replace(/^[ ]{0,3}(-[ ]*-[ ]*-[- ]*)[ \t]*$/gm, "---")
    .replace(/^[ ]{0,3}(_[ ]*_[ ]*_[_ ]*)[ \t]*$/gm, "___")
    .replace(/\*\*[ \t]+\*\*/g, " ")
    .replace(/\*{4,}/g, "");
}

function normalizeObsidianSyntax(input: string): string {
  return input
    .replace(/!\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_all, src: string, alt: string) => `![${alt.trim()}](${markdownImageDestination(src)})`)
    .replace(/!\[\[([^\]]+)\]\]/g, (_all, src: string) => `![${src.trim()}](${markdownImageDestination(src)})`)
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_all, _target: string, label: string) => label.trim())
    .replace(/\[\[([^\]]+)\]\]/g, (_all, label: string) => label.trim());
}

function markdownImageDestination(src: string): string {
  const clean = src.trim();
  if (!/[\s()<>]/.test(clean)) return clean;
  return `<${clean.replace(/>/g, "%3E")}>`;
}

function extractFrontmatter(input: string): { frontmatter: Frontmatter; body: string } {
  if (!input.startsWith("---\n")) return { frontmatter: {}, body: input };
  const end = input.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: input };

  const raw = input.slice(4, end).split("\n");
  const frontmatter: Frontmatter = {};
  for (const line of raw) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1]] = stripQuotes(match[2].trim());
  }
  return { frontmatter, body: input.slice(end + 5).replace(/^\n/, "") };
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}
