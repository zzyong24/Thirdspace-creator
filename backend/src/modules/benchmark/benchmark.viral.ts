// [T-212b] 爆款判定纯函数（统计学，可单测）——照搬鱼鱼 `detect_viral`（SPEC §2.2）。
//
// 判据（二选一即爆款）：
//   ① 绝对爆款：digg ≥ absoluteThreshold（默认 10000）。
//   ② 相对爆款（黑马）：digg ≥ relativeMultiple × 该批样本中位数 且 digg ≥ relativeFloor
//      （默认 3× 且 ≥1000）。相对判据让"在这一批对标里格外突出"的作品也被判爆，防某些
//      源整体量级低时永远选不出黑马。
//
// 纯函数、无 IO、无 Date —— 数值程序化判定（与 scheduled-collection-runner 铁律②同源：
//   爆款判定是确定性统计，绝不调 LLM）。阈值全配置化，默认值即上文。
//
// 中位数：对 diggCount 升序排序取中值（偶数个取中间两数平均）。空输入 → 空输出（无中位数）。
//   median ≤ 0 时（全 0 赞的退化批）viralMultiple 用 max(median,1) 兜底避免除零，相对判据的
//   relativeFloor 仍保证只有 ≥1000 赞的进爆款（全 0 赞批不会误判）。

export interface ViralInputWork {
  awemeId: string;
  diggCount: number;
}

export interface ViralVerdict {
  awemeId: string;
  isViral: boolean;
  /** 爆款倍数 = digg / 该批中位数（median≤0 时用 max(median,1) 兜底）。诊断/排序用。 */
  viralMultiple: number;
}

export interface DetectViralOptions {
  /** 绝对爆款阈值（默认 10000）。 */
  absoluteThreshold?: number;
  /** 相对爆款倍数（默认 3 —— digg ≥ 3× 中位数）。 */
  relativeMultiple?: number;
  /** 相对爆款下限（默认 1000 —— 防低量级批把几十赞的当黑马）。 */
  relativeFloor?: number;
}

export const DEFAULT_VIRAL_OPTIONS: Required<DetectViralOptions> = {
  absoluteThreshold: 10000,
  relativeMultiple: 3,
  relativeFloor: 1000,
};

/** 一批数值的中位数（升序取中；偶数取中间两数均值）。空数组 → null。 */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * 判定一批作品的爆款状态。返回每条 { awemeId, isViral, viralMultiple }（顺序同输入）。
 * 阈值经 opts 覆盖（缺省用 DEFAULT_VIRAL_OPTIONS）。空输入 → []。
 */
export function detectViral(
  works: ViralInputWork[],
  opts: DetectViralOptions = {},
): ViralVerdict[] {
  if (works.length === 0) return [];
  const { absoluteThreshold, relativeMultiple, relativeFloor } = {
    ...DEFAULT_VIRAL_OPTIONS,
    ...opts,
  };

  const median = medianOf(works.map((w) => w.diggCount)) ?? 0;
  // 除零兜底：median≤0（全 0 赞退化批）→ 用 1 作分母，viralMultiple 退化为"相对 1 赞的倍数"
  //   （即 digg 本身），相对判据仍靠 relativeFloor 兜住不误判。
  const denom = median > 0 ? median : 1;

  return works.map((w) => {
    const digg = w.diggCount;
    const isAbsolute = digg >= absoluteThreshold;
    const isRelative = digg >= relativeMultiple * median && digg >= relativeFloor;
    return {
      awemeId: w.awemeId,
      isViral: isAbsolute || isRelative,
      viralMultiple: digg / denom,
    };
  });
}
