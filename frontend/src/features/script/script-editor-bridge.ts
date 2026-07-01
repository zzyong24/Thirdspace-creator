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

// ---------------------------------------------------------------------------
// 分镜时间码(T-024 ①):sections 有 startSeconds/endSeconds,把它渲成 `[mm:ss-mm:ss]`
// 前缀挂到分镜标题上(只读展示;编导式分镜需要在正文里看见每段的时间码)。
// 说明:目前是**只读展示**——时间码从 sections 数据渲进 heading 前缀,用户能看见但
// 不能在 TipTap 里就地改(改要自定义 TipTap node/mark 承载 start/end 属性,大改,不硬啃)。
// 保存往返安全:htmlToSections 读 heading 时**剥掉**这个前缀(stripTimecodePrefix),
// 故前缀不会被误写回 sections[].heading,也不会随每次保存累积。
// ---------------------------------------------------------------------------

/** 秒 → `mm:ss`(负数/非有限值当 0)。纯函数。 */
export function formatTimecode(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * 从 start/end 秒拼一个可见的时间码标签:
 *   - start+end 都有 → `[mm:ss-mm:ss]`
 *   - 只有 start   → `[mm:ss]`
 *   - 都没有       → ""(不加前缀)
 */
export function timecodeLabel(
  startSeconds: number | null,
  endSeconds: number | null,
): string {
  const hasStart = typeof startSeconds === "number" && Number.isFinite(startSeconds);
  const hasEnd = typeof endSeconds === "number" && Number.isFinite(endSeconds);
  if (hasStart && hasEnd) {
    return `[${formatTimecode(startSeconds!)}-${formatTimecode(endSeconds!)}]`;
  }
  if (hasStart) return `[${formatTimecode(startSeconds!)}]`;
  return "";
}

// 匹配挂在 heading 最前的时间码前缀(`[mm:ss]` 或 `[mm:ss-mm:ss]` + 其后空格)。
// 保存往返时剥掉它,避免污染 sections[].heading。
const TIMECODE_PREFIX_RE = /^\[\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?\]\s*/;

/** 剥掉 heading 前缀里的只读时间码标签(见 timecodeLabel);无前缀原样返回。 */
export function stripTimecodePrefix(heading: string): string {
  return heading.replace(TIMECODE_PREFIX_RE, "");
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
    // T-024 ①:分镜时间码只读展示 —— 有 start/end 就把 `[mm:ss-mm:ss]` 前缀挂到标题里,
    // 让编导在富文本里看得见每段的时间码。保存往返由 htmlToSections 剥掉前缀(不污染 heading)。
    const timecode = timecodeLabel(section.startSeconds, section.endSeconds);
    const headingWithTimecode = heading
      ? timecode
        ? `${timecode} ${heading}`
        : heading
      : // 无标题但有时间码的分镜:也用一个 `<h2>` 只承载时间码,别让它丢。
        timecode || "";
    if (headingWithTimecode) {
      parts.push(`<h2>${escapeHtml(headingWithTimecode)}</h2>`);
    }
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
    // 段落既无标题(含时间码)也无正文时,留一个空段,避免 TipTap 把相邻块吞并。
    if (!headingWithTimecode && !pushedBody) parts.push("<p></p>");
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
      // T-024 ①:剥掉只读时间码前缀,避免 `[mm:ss-mm:ss]` 被误写回 sections[].heading
      // (那会在每次保存往返时累积/污染标题)。时间码真值仍留在 sections 的 start/endSeconds。
      current = {
        heading: stripTimecodePrefix(block.text),
        bodyLines: [],
        emphasis: false,
      };
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
