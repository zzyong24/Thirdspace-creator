/**
 * 脚本编辑器 ↔ artifact 的内容桥(T-019 / L4,SPEC §3.4)。
 *
 * 纯函数,无 DOM/无 React —— 同时给 server(读侧 loadScriptEditorData)与 client
 * (TipTap 编辑器 script-rich-editor)用,所以**只字符串进、字符串出**,不碰
 * `document`(jsdom/SSR 下都安全)。
 *
 * 真值约定(artifact 的 ArtifactVersion):
 *   - `contentData.html`   —— TipTap 的规范 HTML(富文本真值,优先读回,忠实往返)。
 *   - `contentData.sections` —— 派生的 `[{ id, heading, body }]`(给大纲/金句派生 +
 *                               AI 初稿兼容:script.draft 只产 sections、无 html,照样能灌)。
 *   - `contentText`        —— 纯文本拼接(可读性 + 字数;不破坏旧读侧)。
 *
 * 读优先级:有 `html` → 直接当编辑器初值(忠实);否则把 `sections` 拼成 HTML
 * (`<h2>heading</h2>` + 每行一个 `<p>`)。这样既新存的富文本能 1:1 回来,
 * 也让历史/AI 初稿(只有 sections)平滑进编辑器。
 */

import type { ScriptSectionView } from "@/types/view-models";

const BLOCK_HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** HTML 实体转义(防 heading/body 里的 `<>&` 破坏拼出的 HTML)。纯字符串,无 DOM。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * `ScriptSectionView[]` → 编辑器初始 HTML。
 * 每段 = 一个 `<h2>` 标题 + body 按换行拆成多个 `<p>`(空行跳过)。emphasis/金句段
 * 的 body 包一层 `<strong>`(对应旧紫色强调,保留语义)。无段落 → 空文档占位 `<p></p>`。
 */
export function sectionsToHtml(
  sections: ReadonlyArray<ScriptSectionView>,
): string {
  if (sections.length === 0) return "<p></p>";
  const parts: string[] = [];
  for (const section of sections) {
    const heading = section.heading.trim();
    if (heading) parts.push(`<h2>${escapeHtml(heading)}</h2>`);
    const emphasize = section.emphasis || section.type === "golden_quote";
    const lines = section.body.split(/\r?\n/);
    let pushedBody = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const inner = emphasize
        ? `<strong>${escapeHtml(line)}</strong>`
        : escapeHtml(line);
      parts.push(`<p>${inner}</p>`);
      pushedBody = true;
    }
    // 段落既无标题也无正文时,留一个空段,避免 TipTap 把相邻块吞并。
    if (!heading && !pushedBody) parts.push("<p></p>");
  }
  return parts.length > 0 ? parts.join("") : "<p></p>";
}

interface ParsedSection {
  heading: string;
  bodyLines: string[];
  emphasis: boolean;
}

/**
 * 极简 HTML → `[{ id, heading, body, emphasis }]`(保存时从 TipTap HTML 派生 sections,
 * 喂回 `contentData.sections`,让大纲/金句读侧 + AI 兼容继续工作)。
 *
 * 不引 DOM 解析器(server/SSR 安全):只按块级标签切。规则——
 *   - `<h1..6>` 开一个新段(其文本 = heading);
 *   - `<p>`/`<li>` 文本进当前段的 body(每个块一行);整块被 `<strong>`/`<b>` 包裹 → emphasis;
 *   - 标题前出现的正文,落进一个无标题首段(heading="")。
 * 标签宽容(忽略属性);文本做实体反转义 + 去标签。
 */
export function htmlToSections(
  html: string,
): Array<{ id: string; heading: string; body: string; emphasis: boolean }> {
  const blocks = extractBlocks(html);
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  for (const block of blocks) {
    if (BLOCK_HEADINGS.has(block.tag)) {
      current = { heading: block.text, bodyLines: [], emphasis: false };
      sections.push(current);
      continue;
    }
    if (!block.text) continue;
    if (!current) {
      current = { heading: "", bodyLines: [], emphasis: false };
      sections.push(current);
    }
    current.bodyLines.push(block.text);
    if (block.emphasized) current.emphasis = true;
  }
  return sections
    .map((s, index) => ({
      id: `script-section-${index}`,
      heading: s.heading,
      body: s.bodyLines.join("\n"),
      emphasis: s.emphasis,
    }))
    .filter((s) => s.heading.length > 0 || s.body.length > 0);
}

interface Block {
  tag: string;
  text: string;
  emphasized: boolean;
}

// 从 HTML 抽块级元素(h1-6 / p / li)。容错:无显式块标签时,把整串当一个段。
function extractBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const blockRe = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    const tag = match[1]!.toLowerCase();
    const inner = match[2] ?? "";
    blocks.push({
      tag,
      text: stripTags(inner),
      emphasized: isWrappedInStrong(inner),
    });
  }
  if (blocks.length === 0) {
    const text = stripTags(html);
    if (text) blocks.push({ tag: "p", text, emphasized: false });
  }
  return blocks;
}

// 整个块内容是否被 <strong>/<b> 包裹(整段强调 → 金句/emphasis)。
function isWrappedInStrong(inner: string): boolean {
  const trimmed = inner.trim();
  return /^<(strong|b)\b[^>]*>[\s\S]*<\/(strong|b)>$/i.test(trimmed);
}

// 去掉所有标签 + 反转义常见实体 + 折叠空白。
function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** TipTap 的纯文本(getText)字数;这里给 server 端从 sections 估算时复用。 */
export function plainTextFromSections(
  sections: ReadonlyArray<ScriptSectionView>,
): string {
  return sections
    .map((s) => `${s.heading}\n${s.body}`.trim())
    .filter((s) => s.length > 0)
    .join("\n\n");
}
