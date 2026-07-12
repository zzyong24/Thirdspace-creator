// [T-254c] SRT 上传校验(制作视频 tab 备料区,SPEC 2026-07-11 §3.1 步骤 1)——
// 挡在提交前的两道确定性检查:①SRT 总时长 vs 视频时长 ②SRT 全文 vs 口播稿相似度
// (skill 两次实锤踩过传错 SRT)。
//
// 实现选择(报告项):**复制 backend 纯函数的最小子集**,而非运行时 import
// `@creatoros/backend/modules/ai-runtime` —— backend 包的 exports map 只暴露模块
// index,client island 引它会把 ai-worker / ai SDK 等服务端依赖拖进浏览器 bundle
// (video-decision-preview 只 type-only 引用,类型擦除无此问题)。真值源 =
// backend/src/modules/ai-runtime/srt.ts(算法/阈值改动须同步两处;两侧测试互为锚)。

/** 一行 SRT 字幕(时间统一用秒,浮点)。与 backend SrtLine 同构。 */
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

/** 解析 SRT 文本 → SrtLine[](容忍 CRLF/BOM/多行字幕/缺序号;全解析不出 → [])。 */
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

/** SRT 总时长(秒)= 最大止秒(空 → 0)。 */
export function srtTotalDurationSec(lines: readonly SrtLine[]): number {
  let max = 0;
  for (const l of lines) if (l.endSec > max) max = l.endSec;
  return max;
}

export interface SrtDurationCheck {
  ok: boolean;
  srtDurationSec: number;
  videoDurationSec: number;
  deltaSec: number;
  toleranceSec: number;
}

/** 校验 ①:时长偏差,容差 = max(5s, 视频时长 5%)。 */
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

/** 极简 token 化:CJK 逐字 + 连续拉丁字母/数字段(小写)。 */
export function tokenizeForOverlap(text: string): string[] {
  const tokens: string[] = [];
  const re = /[一-鿿㐀-䶿]|[a-zA-Z0-9]+(?:\.[0-9]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tokens.push(m[0].toLowerCase());
  return tokens;
}

/** SRT 全文 vs 口播稿的 token 集合 Dice 系数(0~1)。 */
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

/** 校验 ②:相似度阈值 0.55(ASR 正常噪声在 0.7+;与 backend 同值)。 */
export function checkSrtScriptMatch(
  lines: readonly SrtLine[],
  script: string,
  threshold = 0.55,
): SrtScriptCheck {
  const similarity = srtScriptSimilarity(lines, script);
  return { ok: similarity >= threshold, similarity, threshold };
}
