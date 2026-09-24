// [T-232] 评论批量采集的「预算规划」纯逻辑 —— 采集顺序 + run 诚实 message。
//
// 真机根因:comments 采集 49 作品串行,通道额度前几个作品耗完 → 后 48 个空手,run 却标
// succeeded(itemsNew=5)掩盖截断,爆款(330 评)永远轮不到。修三件事(本文件管前两件的纯部分):
//   ① 爆款优先:采集顺序按作品评论数(analytics 最新快照 rawMetrics.comments)降序 ——
//      330 评的先采,额度别花在 0 评作品上;
//   ② 断点续采:**未采过的作品优先于已采过的**(已采与否由该作品评论 watermark 是否非空判定,
//      复用 T-177 既有机制,不新造持久锚)——上轮额度截断后,下轮自动从未采作品继续,而不是
//      每轮都把额度烧在同一批头部作品的重复导航上;已采作品排在后面等额度富余时增量补新评论;
//   ③(调用方)额度耗尽即停 + message 诚实注明「额度截断:已采 X/N,下轮续」,见
//      fetchDouyinCommentsForWorks(douyin-cdp.ts)与 persistence-client comments collector。
//
// 纯函数、无 IO,可直接单测。

/** 一个候选作品的排序输入。 */
export interface CommentCollectionCandidate {
  awemeId: string;
  /** analytics 最新快照的评论数(读不到 → 0,诚实降级排后)。 */
  commentCount: number;
  /** 本作品是否已采过评论(watermark 非空 = 库里已有该作品评论)。 */
  collected: boolean;
}

/**
 * [T-232] 评论采集顺序:未采作品在前、已采作品在后;组内各按 commentCount 降序(爆款优先);
 * 同数保持入参相对顺序(稳定,便于测试与幂等)。返回排好序的 awemeId 列表。
 */
export function orderCommentCollection(
  candidates: readonly CommentCollectionCandidate[],
): string[] {
  return candidates
    .map((c, i) => ({ c, i })) // 带原始下标做稳定 tie-break
    .sort((a, b) => {
      if (a.c.collected !== b.c.collected) return a.c.collected ? 1 : -1; // 未采优先
      if (a.c.commentCount !== b.c.commentCount) {
        return b.c.commentCount - a.c.commentCount; // 爆款优先
      }
      return a.i - b.i; // 稳定
    })
    .map(({ c }) => c.awemeId);
}

/**
 * 完成只依据逐作品确认数；处理过、未被限流均不等于已经完整读取。
 */
export function buildCommentCoverageMessage(input: {
  collectedWorks: number;
  completedWorks: number;
  totalWorks: number;
  truncated: boolean;
  cooldownRemainMs: number;
  hasMore?: boolean;
}): string {
  const { collectedWorks, completedWorks, totalWorks, truncated, cooldownRemainMs } = input;
  const counts=`已处理 ${collectedWorks}/${totalWorks} 个作品，确认完成 ${completedWorks} 个，未完成 ${Math.max(0,totalWorks-completedWorks)} 个`;
  if (!truncated) return `${completedWorks===totalWorks?"本批完成":"本批未完整完成"}:${counts}${input.hasMore?"；仍有后续批次":""}`;
  const eta = Math.max(0, Math.ceil(cooldownRemainMs / 1000));
  return `额度截断:${counts}(通道冷却剩 ${eta}s),未采作品下轮优先续采`;
}
