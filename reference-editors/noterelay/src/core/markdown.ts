import MarkdownIt from "markdown-it";
import type { ParsedNote } from "../types";

const parser = new MarkdownIt({ html: false, linkify: true, typographer: true });

export function normalizeObsidianMarkdown(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n?/, "")
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_all, path: string, alt?: string) => {
      const cleanPath = path.trim();
      const label = alt?.trim() || cleanPath;
      return `![${label}](${markdownImageDestination(cleanPath)})`;
    })
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "[$2]($1)")
    .replace(/\[\[([^\]]+)\]\]/g, "[$1]($1)");
}

function markdownImageDestination(src: string): string {
  if (!/[\s()<>]/.test(src)) return src;
  return `<${src.replace(/>/g, "%3E")}>`;
}

function stripMarkdown(markdown: string): string {
  const parsed = new DOMParser().parseFromString(parser.render(markdown), "text/html");
  return (parsed.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseNote(source: string, fallbackTitle: string): ParsedNote {
  const markdown = normalizeObsidianMarkdown(source);
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return {
    title: heading ?? fallbackTitle,
    source,
    markdown,
    html: parser.render(markdown),
    plainText: stripMarkdown(markdown)
  };
}
