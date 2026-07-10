// [T-183] 改稿 delta 捕捉的纯文本 diff helper。用户手改 AI 产出的脚本时,把 before→after
// 差异摘要成一条「该创作者偏好」线索 —— 飞轮最强品味信号。
//
// 设计约束(见 T-183 SPEC):
//   - 纯函数、零第三方依赖(别引 diff 重库);行/段级 set diff 足够产出「删了什么/加了
//     什么」信号。真正的 LCS 不必要 —— 这是「线索」不是「补丁」。
//   - 输出 = 原始 delta(added/removed 行)+ 一句话线索(clue)。线索是启发式的 hint,
//     added/removed 才是真相;service 落库时两者都存,裁决台里由人评判。
//   - 无实质变化(before === after / 都空)→ 返回 null,调用方不产候选(不误产)。

export interface EditDeltaSummary {
  /** 一句话线索:从 delta 启发式提炼的「该创作者偏好」hint(可能不精确,仅作提示)。 */
  clue: string;
  /** 前一版(AI 产出)有、新版(用户手改)没有的行 —— 用户删掉/改写掉的内容。 */
  removed: string[];
  /** 新版有、前一版没有的行 —— 用户新增/改写成的内容。 */
  added: string[];
  /** 字数变化(after 字符数 − before 字符数);负 = 改短,正 = 扩写。 */
  charDelta: number;
}

// 归一化成非空行数组(按行 diff 的粒度)。trim 掉纯空白行,避免空行噪声。
function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// Extended_Pictographic 覆盖绝大多数 emoji/表情符号(unicode property escape,Node 支持)。
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
function countEmoji(text: string): number {
  const m = text.match(EMOJI_RE);
  return m ? m.length : 0;
}

// 平均句长(以中文/英文常见句末标点分句)。用于「改短句/长句」的启发式线索。
function avgSentenceLen(text: string): number {
  const sentences = text
    .split(/[。！？.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return 0;
  const total = sentences.reduce((acc, s) => acc + s.length, 0);
  return total / sentences.length;
}

// 从 before/after 派生一句话线索。启发式、best-effort —— 命中一个显著信号就返回它,
// 否则退化为通用「调整了措辞/表达」。永不抛(纯计算)。
function deriveClue(before: string, after: string, charDelta: number): string {
  const clues: string[] = [];

  const emojiBefore = countEmoji(before);
  const emojiAfter = countEmoji(after);
  if (emojiBefore > emojiAfter) {
    clues.push(`删减了 emoji/表情(${emojiBefore}→${emojiAfter})`);
  } else if (emojiAfter > emojiBefore) {
    clues.push(`增加了 emoji/表情(${emojiBefore}→${emojiAfter})`);
  }

  const sentBefore = avgSentenceLen(before);
  const sentAfter = avgSentenceLen(after);
  // 平均句长明显下降(>20%)→ 倾向短句;上升 → 倾向长句。
  if (sentBefore > 0 && sentAfter > 0) {
    if (sentAfter < sentBefore * 0.8) {
      clues.push(
        `把句子改短(平均句长 ${Math.round(sentBefore)}→${Math.round(sentAfter)} 字)`,
      );
    } else if (sentAfter > sentBefore * 1.25) {
      clues.push(
        `把句子改长(平均句长 ${Math.round(sentBefore)}→${Math.round(sentAfter)} 字)`,
      );
    }
  }

  // 整体篇幅变化(字数)。阈值 8 字,避免微改也报。
  if (charDelta <= -8) {
    clues.push(`整体压缩(少了 ${-charDelta} 字)`);
  } else if (charDelta >= 8) {
    clues.push(`整体扩写(多了 ${charDelta} 字)`);
  }

  if (clues.length === 0) {
    return "调整了措辞/表达(未识别出显著模式,见原始 delta)";
  }
  return clues.join(";");
}

/**
 * [T-183] 计算 before(AI 产出)→ after(用户手改)的改稿差异摘要。
 * 纯函数;无实质变化返回 null(调用方据此决定是否产候选 learning)。
 */
export function summarizeEditDelta(
  before: string,
  after: string,
): EditDeltaSummary | null {
  const b = before ?? "";
  const a = after ?? "";
  // 无实质变化(完全相同 / 都空)→ 不产信号。
  if (b === a) return null;
  if (b.trim().length === 0 && a.trim().length === 0) return null;

  const beforeLines = toLines(b);
  const afterLines = toLines(a);
  const afterSet = new Set(afterLines);
  const beforeSet = new Set(beforeLines);

  const removed = beforeLines.filter((l) => !afterSet.has(l));
  const added = afterLines.filter((l) => !beforeSet.has(l));

  // 行级 set diff 无差异,但字符层面变了(极少见:仅空白/换行调整)→ 仍不产信号。
  if (removed.length === 0 && added.length === 0) return null;

  const charDelta = a.length - b.length;
  const clue = deriveClue(b, a, charDelta);

  return { clue, removed, added, charDelta };
}

// delta 摘要 → 落库的 insight 正文(原始 delta + 一句话线索)。截断超长行,避免一条
// learning 撑爆。纯函数,永不抛。
const MAX_ITEMS = 12;
const MAX_LINE = 200;
function clip(lines: string[]): string {
  return lines
    .slice(0, MAX_ITEMS)
    .map((l) => (l.length > MAX_LINE ? `${l.slice(0, MAX_LINE)}…` : l))
    .map((l) => `  · ${l}`)
    .join("\n");
}

export function renderEditDeltaInsight(summary: EditDeltaSummary): string {
  const parts: string[] = [`【改稿信号】线索:${summary.clue}`];
  if (summary.removed.length > 0) {
    parts.push(`删除/改写掉(${summary.removed.length} 行):\n${clip(summary.removed)}`);
  }
  if (summary.added.length > 0) {
    parts.push(`新增/改写成(${summary.added.length} 行):\n${clip(summary.added)}`);
  }
  parts.push(`字数变化:${summary.charDelta >= 0 ? "+" : ""}${summary.charDelta}`);
  return parts.join("\n");
}
