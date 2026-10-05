export type MarkdownSection = {
  sectionId: string;
  order: number;
  heading: string;
  headingLevel: number;
  body: string;
  sourceRefs: unknown[];
};

const ANCHOR = /^<!-- creatoros-section:([^\s>]+) -->$/;
const ASSET_SOURCE = /^creatoros-asset:([^:\s]+):([^\s"')]+)$/;

export function serializeArticleMarkdown(sections: MarkdownSection[]): string {
  return [...sections].sort((a, b) => a.order - b.order).map((section) =>
    `<!-- creatoros-section:${section.sectionId} -->\n${"#".repeat(section.headingLevel)} ${section.heading}\n${section.body}`,
  ).join("\n\n");
}

function trustedImageSources(markdown: string, sectionId: string): Array<{ sectionId: string; assetId: string; assetFileId: string }> {
  const references = new Map<string, { sectionId: string; assetId: string; assetFileId: string }>();
  if (/!\s*\[/.test(markdown)) throw new Error("Markdown 图片链接不受支持；请从 CreatorOS 素材库插入正文图片。");
  const add = (source: string) => {
    const match = ASSET_SOURCE.exec(source.trim());
    if (!match) throw new Error("正文图片必须从 CreatorOS 素材库重新插入；其它图片地址不受支持。");
    const id = `${match[1]}:${match[2]}`;
    references.set(id, { sectionId, assetId: match[1]!, assetFileId: match[2]! });
  };

  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)) add(match[1]!);
  for (const match of markdown.matchAll(/<img\b([^>]*?)>/gi)) {
    const attributes = match[1] ?? "";
    if (/\bsrcset\s*=/i.test(attributes)) throw new Error("正文图片的 srcset 不受支持；请从 CreatorOS 素材库插入单张图片。");
    const src = attributes.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!src) throw new Error("正文中的 img 必须使用 CreatorOS 素材占位符。");
    add(src);
  }
  if (/<(?:picture|source)\b/i.test(markdown)) throw new Error("picture/source 图片不受支持；请从 CreatorOS 素材库插入图片。");
  if (/<style\b[^>]*>[\s\S]*?\burl\s*\(|\bstyle\s*=\s*(["'])[^"']*\burl\s*\(/i.test(markdown)) throw new Error("正文 CSS 图片地址不受支持；请从 CreatorOS 素材库插入图片。");
  return [...references.values()];
}

export function parseArticleMarkdown(markdown: string, original: MarkdownSection[]): { sections: MarkdownSection[]; imageRefs: Array<{ sectionId: string; assetId: string; assetFileId: string }> } {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const entries: Array<{ id: string; lines: string[] }> = [];
  let current: { id: string; lines: string[] } | null = null;
  let fenced = false;
  for (const line of lines) {
    if (/^\s*(```+|~~~+)/.test(line)) fenced = !fenced;
    const marker = !fenced && ANCHOR.exec(line);
    if (marker) {
      if (current) entries.push(current);
      current = { id: marker[1]!, lines: [] };
    } else if (current) current.lines.push(line);
    else if (line.trim()) throw new Error("文章开头缺少 CreatorOS 段落标记，无法安全保存。");
  }
  if (current) entries.push(current);

  const expectedIds = original.map((section) => section.sectionId);
  const seen = entries.map((entry) => entry.id);
  if (new Set(seen).size !== seen.length || seen.some((id) => !expectedIds.includes(id)) || expectedIds.some((id) => !seen.includes(id))) {
    throw new Error("段落标记缺失、重复或未知。请恢复未保存草稿，再用 CreatorOS 段落操作新增、删除或排序。");
  }
  const imageRefs: Array<{ sectionId: string; assetId: string; assetFileId: string }> = [];
  const sections = entries.map((entry, order) => {
    const bodyForImageCheck = entry.lines.join("\n").replace(/(^|\n)\s*(```+|~~~+)[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "$1");
    imageRefs.push(...trustedImageSources(bodyForImageCheck, entry.id));
    const headingIndex = entry.lines.findIndex((line) => /^#{1,6}\s+/.test(line));
    if (headingIndex < 0) throw new Error(`段落 ${entry.id} 缺少标题行，无法安全保存。`);
    const headingLine = entry.lines[headingIndex]!;
    const match = /^(#{1,6})\s+(.*)$/.exec(headingLine)!;
    const body = [...entry.lines.slice(0, headingIndex), ...entry.lines.slice(headingIndex + 1)].join("\n").replace(/^\n+|\n+$/g, "");
    const base = original.find((section) => section.sectionId === entry.id)!;
    return { ...base, order, headingLevel: match[1]!.length, heading: match[2]!, body };
  });
  return { sections, imageRefs };
}
