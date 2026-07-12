// [T-254b] SRT 纯函数工具 —— 制作视频管线的时间真值层(SPEC 2026-07-11 §3.1 步骤 1-2)。
// 全部纯函数、确定性、零依赖:解析 / 校验(时长匹配 + 与口播稿相似度,给 T-254c 上传前
// 挡错 SRT 用,skill 两次实锤踩过传错)/ 吸附(所有 AI 插点吸附 SRT 行 start 集合,跨模型
// 稳定关键)。导出给 runner(video-decisions-runner)与 tab UI(T-254c)共用。

/** 一行 SRT 字幕(时间统一用秒,浮点)。 */
export interface SrtLine {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

// `00:01:02,345` / `00:01:02.345` → 秒(浮点)。不合法返回 null(诚实,不猜)。
function parseTimestamp(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/.exec(raw.trim());
  if (!m) return null;
  return (
    Number(m[1]) * 3600 +
    Number(m[2]) * 60 +
    Number(m[3]) +
    Number((m[4] ?? "0").padEnd(3, "0")) / 1000
  );
}

/**
 * 解析 SRT 文本 → SrtLine[]。容忍 CRLF/BOM/多行字幕文本(合并为一行,空格连接)/块间多空行;
 * 序号缺失时按出现顺序补(1 起)。整体解析不出任何时间行 → 返回 [](调用方据此诚实报错)。
 */
export function parseSrt(text: string): SrtLine[] {
  if (!text) return [];
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const lines: SrtLine[] = [];
  for (const block of blocks) {
    const rows = block
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    if (rows.length === 0) continue;
    // 找时间轴行(允许块首没有序号行)。
    const timeRowIdx = rows.findIndex((r) => r.includes("-->"));
    if (timeRowIdx === -1) continue;
    const [rawStart, rawEnd] = rows[timeRowIdx]!.split("-->");
    const startSec = parseTimestamp(rawStart ?? "");
    const endSec = parseTimestamp(rawEnd ?? "");
    if (startSec === null || endSec === null) continue;
    const numbered =
      timeRowIdx > 0 ? Number.parseInt(rows[timeRowIdx - 1]!, 10) : NaN;
    lines.push({
      index: Number.isFinite(numbered) ? numbered : lines.length + 1,
      startSec,
      endSec,
      text: rows.slice(timeRowIdx + 1).join(" "),
    });
  }
  return lines;
}

/** SRT 总时长(秒)= 最后一行的止秒(空 → 0)。 */
export function srtTotalDurationSec(lines: readonly SrtLine[]): number {
  let max = 0;
  for (const l of lines) if (l.endSec > max) max = l.endSec;
  return max;
}

export interface SrtDurationCheck {
  ok: boolean;
  srtDurationSec: number;
  videoDurationSec: number;
  /** |SRT 总时长 - 视频时长|(秒)。 */
  deltaSec: number;
  toleranceSec: number;
}

/**
 * 校验 ①:SRT 总时长 vs 视频时长偏差(传错 SRT 的最快信号)。容差 = max(5s, 视频时长 5%)。
 */
export function checkSrtDurationMatch(
  lines: readonly SrtLine[],
  videoDurationSec: number,
): SrtDurationCheck {
  const srtDurationSec = srtTotalDurationSec(lines);
  const toleranceSec = Math.max(5, videoDurationSec * 0.05);
  const deltaSec = Math.abs(srtDurationSec - videoDurationSec);
  return {
    ok: lines.length > 0 && deltaSec <= toleranceSec,
    srtDurationSec,
    videoDurationSec,
    deltaSec,
    toleranceSec,
  };
}

/**
 * 极简 token 化(相似度用):CJK 逐字 + 连续拉丁字母/数字段(小写)。标点/空白丢弃。
 * 中文口播场景逐字粒度对 ASR 错字最鲁棒(错一个字只丢一个 token)。
 */
export function tokenizeForOverlap(text: string): string[] {
  const tokens: string[] = [];
  const re = /[一-鿿㐀-䶿]|[a-zA-Z0-9]+(?:\.[0-9]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tokens.push(m[0].toLowerCase());
  return tokens;
}

/**
 * 校验 ② 的核:SRT 全文 vs 口播稿的**简单 token 重合率**(Dice 系数,token 集合):
 * 2·|A∩B| / (|A|+|B|),0~1。ASR 错字/语气词差异只小幅拉低;整篇传错(另一条稿)会跌穿阈值。
 */
export function srtScriptSimilarity(
  lines: readonly SrtLine[],
  script: string,
): number {
  const a = new Set(tokenizeForOverlap(lines.map((l) => l.text).join(" ")));
  const b = new Set(tokenizeForOverlap(script));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}

export interface SrtScriptCheck {
  ok: boolean;
  similarity: number;
  threshold: number;
}

/** 校验 ②:SRT 全文 vs 口播稿相似度(默认阈值 0.55,ASR 正常噪声在 0.7+)。 */
export function checkSrtScriptMatch(
  lines: readonly SrtLine[],
  script: string,
  threshold = 0.55,
): SrtScriptCheck {
  const similarity = srtScriptSimilarity(lines, script);
  return { ok: similarity >= threshold, similarity, threshold };
}

/**
 * 吸附:任意时刻 → 最近的 SRT 行 start(starts 为空原样返回)。四决策所有 `at`/场景边界
 * 的后处理共用(zod refine 卡住大偏差 → SDK 重试;小偏差由本函数吸附,跨模型稳定关键)。
 */
export function nearestSrtStart(
  atSec: number,
  starts: readonly number[],
): number {
  if (starts.length === 0) return atSec;
  let best = starts[0]!;
  let bestDelta = Math.abs(atSec - best);
  for (const s of starts) {
    const d = Math.abs(atSec - s);
    if (d < bestDelta) {
      best = s;
      bestDelta = d;
    }
  }
  return best;
}

/** SRT 行 start 集合(升序去重)—— 场景边界/插点的合法落点全集。 */
export function srtStartSet(lines: readonly SrtLine[]): number[] {
  return [...new Set(lines.map((l) => l.startSec))].sort((x, y) => x - y);
}
