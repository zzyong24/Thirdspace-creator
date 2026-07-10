/**
 * [T-198] win-video-tutor 课程知识的结构化解析。
 *
 * 背景:win-video-tutor 的 22 节课以 YAML 序列存入知识库(每个知识点一个
 * mapping,字段 id/lesson/module/title/one_line/core/examples/misconceptions/
 * socratic(q+key_points+hint)/practice_task/rubric)。旧装机把整段 YAML 原文
 * dump 进预览,满屏难读。此处提供一个**聚焦该形状的健壮解析器**:
 *   - 命中课程 YAML → 解析成一组知识点结构(供预览渲成带小标题的可读区块);
 *   - 不像课程 YAML / 解析异常 / 零知识点 → 返回 null,调用方诚实退回
 *     markdown / 纯文本渲染(绝不崩)。
 *
 * 刻意不引入 YAML 依赖(项目规矩:不新增重依赖),只按这批课程的固定缩进形状
 * 做行级解析;任何越界结构都被防御性跳过,不抛异常。
 */

export interface SocraticQuestion {
  readonly q: string;
  readonly keyPoints: ReadonlyArray<string>;
  readonly hint?: string;
}

export interface LessonPoint {
  readonly id?: string;
  readonly title?: string;
  readonly module?: string;
  readonly difficulty?: string;
  readonly oneLine?: string;
  readonly core?: string;
  readonly examples?: string;
  readonly misconceptions?: string;
  readonly socratic: ReadonlyArray<SocraticQuestion>;
  readonly practiceTask?: string;
}

function leadingSpaces(s: string): number {
  const m = /^ */.exec(s);
  return m ? m[0].length : 0;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return t.slice(1, -1);
    }
  }
  return t;
}

/**
 * 收一个「块标量」(`key: |`)的内容:从 start 起,收所有缩进 >2 的行(含空行),
 * 遇到缩进 <=2 的非空行(下一个字段/结构)停;按最小缩进 dedent,回 [文本, 下标]。
 */
function collectBlock(lines: ReadonlyArray<string>, start: number): [string, number] {
  const collected: string[] = [];
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      collected.push("");
      continue;
    }
    if (leadingSpaces(line) <= 2) break;
    collected.push(line);
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") {
    collected.pop();
  }
  const indents = collected
    .filter((l) => l.trim() !== "")
    .map((l) => leadingSpaces(l));
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  const text = collected.map((l) => l.slice(min)).join("\n").trim();
  return [text, i];
}

/** 收一段「原始缩进块」(不 dedent),供 socratic 这种需保留缩进结构的字段解析。 */
function collectRaw(lines: ReadonlyArray<string>, start: number): [string[], number] {
  const out: string[] = [];
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") {
      out.push("");
      continue;
    }
    if (leadingSpaces(line) <= 2) break;
    out.push(line);
  }
  return [out, i];
}

function parseSocratic(raw: ReadonlyArray<string>): SocraticQuestion[] {
  const items: SocraticQuestion[] = [];
  let i = 0;
  while (i < raw.length) {
    const qm = /^\s*-\s+q:\s*(.*)$/.exec(raw[i]!);
    if (!qm) {
      i += 1;
      continue;
    }
    let q = "";
    const rawQ = (qm[1] ?? "").trim();
    if (rawQ === "|" || rawQ === ">") {
      const [text, next] = collectBlock(raw, i + 1);
      q = text;
      i = next;
    } else {
      q = stripQuotes(rawQ);
      i += 1;
    }
    const keyPoints: string[] = [];
    let hint: string | undefined;
    // 消费本小题的 key_points / hint,直到下一道 `- q:` 或块尾。
    while (i < raw.length && !/^\s*-\s+q:/.test(raw[i]!)) {
      const line = raw[i]!;
      if (/^\s*key_points:\s*$/.test(line)) {
        i += 1;
        while (
          i < raw.length &&
          /^\s*-\s+/.test(raw[i]!) &&
          !/^\s*-\s+q:/.test(raw[i]!)
        ) {
          const im = /^\s*-\s+(.*)$/.exec(raw[i]!);
          if (im && (im[1] ?? "").trim() !== "") {
            keyPoints.push(stripQuotes(im[1]!.trim()));
          }
          i += 1;
        }
        continue;
      }
      const hm = /^\s*hint:\s*(.*)$/.exec(line);
      if (hm) {
        hint = stripQuotes((hm[1] ?? "").trim());
        i += 1;
        continue;
      }
      i += 1;
    }
    items.push(hint ? { q, keyPoints, hint } : { q, keyPoints });
  }
  return items;
}

function parseItem(itemLines: ReadonlyArray<string>): LessonPoint {
  let id: string | undefined;
  let title: string | undefined;
  let module: string | undefined;
  let difficulty: string | undefined;
  let oneLine: string | undefined;
  let core: string | undefined;
  let examples: string | undefined;
  let misconceptions: string | undefined;
  let practiceTask: string | undefined;
  let socratic: SocraticQuestion[] = [];

  const assign = (key: string, value: string): void => {
    switch (key) {
      case "id":
        id = value;
        break;
      case "title":
        title = value;
        break;
      case "module":
        module = value;
        break;
      case "difficulty":
        difficulty = value;
        break;
      case "one_line":
        oneLine = value;
        break;
      case "core":
        core = value;
        break;
      case "examples":
        examples = value;
        break;
      case "misconceptions":
        misconceptions = value;
        break;
      case "practice_task":
        practiceTask = value;
        break;
      default:
        break;
    }
  };

  for (let i = 0; i < itemLines.length; i += 1) {
    const line = itemLines[i]!;
    // 字段固定在缩进 2(item 首行的 `- ` 已被规整成 `  `)。
    const m = /^ {2}(\w+):(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    const rest = (m[2] ?? "").trim();
    if (key === "socratic") {
      const [block, next] = collectRaw(itemLines, i + 1);
      socratic = parseSocratic(block);
      i = next - 1;
      continue;
    }
    if (rest === "|" || rest === ">") {
      const [text, next] = collectBlock(itemLines, i + 1);
      assign(key, text);
      i = next - 1;
      continue;
    }
    if (rest !== "" && rest !== "[]") {
      assign(key, stripQuotes(rest));
    }
  }

  return {
    id,
    title,
    module,
    difficulty,
    oneLine,
    core,
    examples,
    misconceptions,
    socratic,
    practiceTask,
  };
}

function doParse(raw: string): LessonPoint[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const items: string[][] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    if (/^-\s/.test(line)) {
      // 顶层序列项起点;把 `- ` 规整成 `  ` 让字段统一落缩进 2。
      cur = ["  " + line.slice(2)];
      items.push(cur);
    } else if (cur) {
      cur.push(line);
    }
  }
  return items
    .map((itemLines) => parseItem(itemLines))
    .filter(
      (p) =>
        // 至少要有一个可读正文字段,才算解析出有内容的知识点。
        Boolean(p.oneLine || p.core || p.examples || p.misconceptions) ||
        p.socratic.length > 0,
    );
}

/**
 * 解析课程 YAML 为知识点结构。
 *   - 命中课程形状且至少解出 1 个有内容的知识点 → LessonPoint[];
 *   - 否则(不像课程 YAML / 异常 / 零知识点)→ null(调用方退回 markdown/纯文本)。
 */
export function parseLessonPoints(raw: string): LessonPoint[] | null {
  if (!raw || raw.trim() === "") return null;
  // 嗅探:必须像课程 YAML —— 顶层 `- id:` 序列,或含 one_line/core 键。
  const looksLikeLesson =
    /(^|\n)-\s+id:/.test(raw) || /\n\s*one_line:\s/.test(raw);
  if (!looksLikeLesson) return null;
  try {
    const points = doParse(raw);
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

/**
 * [T-198] 入库侧:把课程 YAML 转成**可读 markdown**(带小标题),供 seed 存库,
 * 这样新装机预览直接走 markdown 渲染就可读(无需依赖展示侧的 YAML 解析)。
 * 解析不出(非课程 YAML / 异常)→ 返回 null,seed 诚实退回原文入库。
 */
export function lessonPointsToMarkdown(raw: string): string | null {
  const points = parseLessonPoints(raw);
  if (!points) return null;
  const blocks = points.map((p) => onePointToMarkdown(p));
  const md = blocks.join("\n\n---\n\n").trim();
  return md.length > 0 ? md : null;
}

function onePointToMarkdown(p: LessonPoint): string {
  const parts: string[] = [];
  if (p.title) parts.push(`# ${p.title}`);
  const meta: string[] = [];
  if (p.module) meta.push(p.module);
  if (p.difficulty) meta.push(`难度 ${p.difficulty}`);
  if (meta.length > 0) parts.push(`> ${meta.join(" · ")}`);
  if (p.oneLine) parts.push(`## 一句话\n\n${p.oneLine}`);
  if (p.core) parts.push(`## 正文\n\n${p.core}`);
  if (p.examples) parts.push(`## 案例\n\n${p.examples}`);
  if (p.misconceptions) parts.push(`## 易错点\n\n${p.misconceptions}`);
  if (p.socratic.length > 0) {
    const qs = p.socratic
      .map((q, i) => {
        const lines = [`### Q${i + 1}. ${q.q}`];
        if (q.keyPoints.length > 0) {
          lines.push("要点:");
          for (const kp of q.keyPoints) lines.push(`- ${kp}`);
        }
        if (q.hint) lines.push(`\n提示:${q.hint}`);
        return lines.join("\n");
      })
      .join("\n\n");
    parts.push(`## 苏格拉底提问\n\n${qs}`);
  }
  if (p.practiceTask) parts.push(`## 实践作业\n\n${p.practiceTask}`);
  return parts.join("\n\n");
}
