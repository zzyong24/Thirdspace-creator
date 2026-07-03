// 评论回流三级去噪门 · ①硬规则预筛(T-092 SPEC §2.1,纯函数零 AI)。
// 先把量打下来:去掉太短/纯表情标点/水词/已回流的评论,按 likeCount desc + 新近
// 取 top N 进 ② AI 蒸馏筛(comment.qa-sift)。全部规则可单测;水词表是常量可维护。

/** 预筛输入 —— audienceSignalResource 的最小投影。 */
export interface PrefilterSignal {
  readonly id: string;
  readonly rawText: string;
  readonly likeCount: number | null;
  readonly externalId: string | null;
  readonly createdAt: string;
}

/** 水词表(常量可维护):独立成句时无知识价值的高频客套/灌水词。 */
export const WATER_WORDS: ReadonlyArray<string> = [
  "沙发",
  "学到了",
  "学习了",
  "支持",
  "第一",
  "前排",
  "路过",
  "顶",
  "赞",
  "牛",
  "牛逼",
  "厉害",
  "太强了",
  "666",
  "哈哈哈",
  "打卡",
  "马住",
  "码住",
  "收藏了",
  "关注了",
  "来了",
  "涨知识了",
];

// 归一:去空白/常见标点/emoji,只留中英数字——用于「太短」「纯水词」判定。
function normalize(text: string): string {
  return text.replace(/[^\p{L}\p{N}]/gu, "");
}

/** 单条评论是否被硬规则排除(不含「已回流」判定——那是集合级规则)。 */
export function isNoiseComment(rawText: string): boolean {
  const normalized = normalize(rawText);
  // <4 字(归一后)—— 「?」「好」「666」这类无从蒸馏。
  if (normalized.length < 4) return true;
  // 命中水词表:归一后正文就是水词本身(或水词重复,如「学到了学到了」)。
  for (const word of WATER_WORDS) {
    const w = normalize(word);
    if (w.length === 0) continue;
    if (normalized === w) return true;
    // 纯重复水词(≤3 次重复)也视为水。
    if (normalized.length <= w.length * 3 && normalized.split(w).join("") === "") {
      return true;
    }
  }
  return false;
}

export const PREFILTER_TOP_N = 200;

export interface PrefilterResult {
  /** 通过预筛、进 ② AI 蒸馏筛的评论(top N,likeCount desc + 新近)。 */
  kept: PrefilterSignal[];
  /** 被硬规则(短/水)排除的条数。 */
  droppedNoise: number;
  /** 已回流(锚命中)排除的条数。 */
  droppedBackflowed: number;
}

/**
 * ①硬规则预筛:排除噪音与已回流,排序取 top N。
 * @param signals             采集到的评论信号(source='comment')。
 * @param backflowedExternalIds 已回流锚集合(knowledge sourceMetadata.signalExternalIds 反查)。
 * @param backflowedSignalIds   已回流 signalId 集合(无 externalId 的存量评论兜底防重)。
 */
export function prefilterComments(
  signals: ReadonlyArray<PrefilterSignal>,
  backflowedExternalIds: ReadonlySet<string>,
  backflowedSignalIds: ReadonlySet<string> = new Set(),
): PrefilterResult {
  let droppedNoise = 0;
  let droppedBackflowed = 0;
  const kept: PrefilterSignal[] = [];
  for (const signal of signals) {
    if (
      (signal.externalId && backflowedExternalIds.has(signal.externalId)) ||
      backflowedSignalIds.has(signal.id)
    ) {
      droppedBackflowed += 1;
      continue;
    }
    if (isNoiseComment(signal.rawText)) {
      droppedNoise += 1;
      continue;
    }
    kept.push(signal);
  }
  kept.sort((a, b) => {
    const byLike = (b.likeCount ?? -1) - (a.likeCount ?? -1);
    if (byLike !== 0) return byLike;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
  return {
    kept: kept.slice(0, PREFILTER_TOP_N),
    droppedNoise,
    droppedBackflowed,
  };
}

/**
 * 从 knowledge.list 行提取「已回流」双集合(externalIds + signalIds)。
 * 只认 active + origin='comment_backflow' 的行(archived 的 qa 视为删除,允许重新回流)。
 */
export function collectBackflowedAnchors(
  items: ReadonlyArray<{
    readonly status: string;
    readonly sourceMetadata: Record<string, unknown>;
  }>,
): { externalIds: Set<string>; signalIds: Set<string> } {
  const externalIds = new Set<string>();
  const signalIds = new Set<string>();
  for (const item of items) {
    if (item.status !== "active") continue;
    const meta = item.sourceMetadata ?? {};
    if (meta.origin !== "comment_backflow") continue;
    const ext = meta.signalExternalIds;
    if (Array.isArray(ext)) {
      for (const v of ext) if (typeof v === "string" && v) externalIds.add(v);
    }
    const sig = meta.signalIds;
    if (Array.isArray(sig)) {
      for (const v of sig) if (typeof v === "string" && v) signalIds.add(v);
    }
  }
  return { externalIds, signalIds };
}
