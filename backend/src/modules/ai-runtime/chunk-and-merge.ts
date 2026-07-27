/**
 * AI 长输入共享分块契约。
 *
 * 只负责三件事：确定性切块、严格按原顺序串行执行、报告统一进度。如何合并以及失败后
 * “整次失败”还是“局部 fallback”，由调用方显式选择，避免不同能力偷偷采用不同语义。
 */

export interface OrderedChunk<T> {
  /** 0-based 块序号。 */
  index: number;
  total: number;
  /** 在原始 items/文本中的半开区间。 */
  start: number;
  end: number;
  items: readonly T[];
}

export interface TextChunk {
  index: number;
  total: number;
  /** 在 trim 后原文中的字符半开区间。 */
  start: number;
  end: number;
  text: string;
}

export type ChunkProgressStatus = "processing" | "completed" | "fallback";

export interface ChunkProgress {
  status: ChunkProgressStatus;
  /** 当前块 0-based 序号。 */
  index: number;
  total: number;
  /** 已经完成（含 fallback）的块数。 */
  completed: number;
}

export type ChunkProgressListener = (
  progress: ChunkProgress,
) => void | Promise<void>;

export class ChunkProcessingError extends Error {
  readonly chunkIndex: number;
  readonly totalChunks: number;
  readonly completedChunks: number;

  constructor(
    chunkIndex: number,
    totalChunks: number,
    completedChunks: number,
    cause: unknown,
  ) {
    super(
      `分块 ${chunkIndex + 1}/${totalChunks} 处理失败（此前已完成 ${completedChunks} 块）`,
      { cause },
    );
    this.name = "ChunkProcessingError";
    this.chunkIndex = chunkIndex;
    this.totalChunks = totalChunks;
    this.completedChunks = completedChunks;
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是正整数`);
  }
}

/** 固定 item 数切块；空输入返回空数组。 */
export function chunkOrderedItems<T>(
  items: readonly T[],
  maxItems: number,
): OrderedChunk<T>[] {
  assertPositiveInteger(maxItems, "maxItems");
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < items.length; start += maxItems) {
    ranges.push({ start, end: Math.min(start + maxItems, items.length) });
  }
  return ranges.map(({ start, end }, index) => ({
    index,
    total: ranges.length,
    start,
    end,
    items: items.slice(start, end),
  }));
}

const TEXT_BOUNDARIES = ["\n\n", "\n", "。", "！", "？", "；", ".", "!", "?", ";"];

function chooseTextEnd(text: string, start: number, maxChars: number): number {
  const hardEnd = Math.min(start + maxChars, text.length);
  if (hardEnd === text.length) return hardEnd;

  // 只在窗口后 40% 里找自然边界，避免某个很早的换行制造大量碎块。
  const minEnd = start + Math.floor(maxChars * 0.6);
  let bestEnd = -1;
  for (const boundary of TEXT_BOUNDARIES) {
    const found = text.lastIndexOf(boundary, hardEnd - 1);
    if (found < minEnd) continue;
    bestEnd = Math.max(bestEnd, found + boundary.length);
  }
  return bestEnd > start ? bestEnd : hardEnd;
}

/**
 * 按字符上限切长文，优先落在段落/句子边界。输入只做一次首尾 trim；所有 chunk 拼接后严格
 * 等于该 trim 后文本，因此覆盖字符数可审计，也不会因 overlap 重复蒸馏。
 */
export function chunkTextDeterministically(
  raw: string,
  maxChars: number,
): TextChunk[] {
  assertPositiveInteger(maxChars, "maxChars");
  const text = raw.trim();
  const ranges: Array<{ start: number; end: number }> = [];
  let start = 0;
  while (start < text.length) {
    const end = chooseTextEnd(text, start, maxChars);
    ranges.push({ start, end });
    start = end;
  }
  return ranges.map(({ start: chunkStart, end }, index) => ({
    index,
    total: ranges.length,
    start: chunkStart,
    end,
    text: text.slice(chunkStart, end),
  }));
}

async function emitProgress(
  listener: ChunkProgressListener | undefined,
  progress: ChunkProgress,
): Promise<void> {
  if (!listener) return;
  try {
    await listener(progress);
  } catch {
    // 进度是旁路观察，不得因 UI/日志回调失败改变核心任务结果。
  }
}

/**
 * 严格串行地按 chunk.index 执行。
 *
 * - 未提供 onChunkError：首个失败抛 ChunkProcessingError，调用方不能拿到伪完整部分结果；
 * - 提供 onChunkError：由调用方构造该块的明确 fallback，随后继续后续块。
 */
export async function runOrderedChunks<TChunk extends { index: number; total: number }, TResult>(
  input: {
    chunks: readonly TChunk[];
    process: (chunk: TChunk) => Promise<TResult>;
    onChunkError?: (error: unknown, chunk: TChunk) => Promise<TResult> | TResult;
    onProgress?: ChunkProgressListener;
  },
): Promise<TResult[]> {
  const results: TResult[] = [];
  for (const chunk of input.chunks) {
    await emitProgress(input.onProgress, {
      status: "processing",
      index: chunk.index,
      total: chunk.total,
      completed: results.length,
    });
    try {
      results.push(await input.process(chunk));
      await emitProgress(input.onProgress, {
        status: "completed",
        index: chunk.index,
        total: chunk.total,
        completed: results.length,
      });
    } catch (error) {
      if (!input.onChunkError) {
        throw new ChunkProcessingError(
          chunk.index,
          chunk.total,
          results.length,
          error,
        );
      }
      results.push(await input.onChunkError(error, chunk));
      await emitProgress(input.onProgress, {
        status: "fallback",
        index: chunk.index,
        total: chunk.total,
        completed: results.length,
      });
    }
  }
  return results;
}
