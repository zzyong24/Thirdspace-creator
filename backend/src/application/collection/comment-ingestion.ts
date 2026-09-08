import { createHash } from "node:crypto";
export interface CommentRecord {
  commentId: string;
  awemeId: string;
  text: string;
  likeCount: number;
  replyCount: number;
  createTime: number; // 秒;缺失记 0
  userId: string; // 评论者 user id(缺失空串)
  userName: string; // 评论者昵称(缺失空串)
  ipLabel: string; // ip 归属(缺失空串)
}

export interface CommentIngestPorts {
  /** 建/取一条 ingestion run(externalSourceId+idempotencyKey 幂等),返回 runId。 */
  createRun(input: {
    externalSourceId: string;
    runType: string;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
  /** record_key 是否已在该 run 落过(ux_ingestion_records_run_key 预检 → 已写跳过)。 */
  recordExists(runId: string, recordKey: string): Promise<boolean>;
  /** 落 ingestion_records ledger(幂等锚);标记该 record_key 已写。 */
  markRecordWritten(runId: string, recordKey: string): Promise<void>;
  /** 写一条 audience_signal(C-4:ingestionRunId 必带,见 ingestAudienceSignal)。
   *  T-065:带 externalId(评论粒度幂等锚);返回 inserted=false 表示命中跨 run 唯一锚
   *  (user+source+external_id)、库里已有该评论,本次未新写。 */
  ingestSignal(input: {
    source: string;
    rawText: string;
    demandTag: string | null;
    ingestionRunId: string;
    // 评论按作品可读 (T-030 D6) — 回填该评论所属作品 (来自 aweme_id→publication);
    // 无匹配作品 → null,不报错 (F3 边界)。
    publicationId: string | null;
    // 评论点赞数 (T-042 热榜排序依据) — 采集抓的 digg_count;无值 → null。
    likeCount: number | null;
    // 评论粒度幂等锚 (T-065) — `douyin:comment:<cid>`;cid 拿不到时退化为内容 hash 锚。
    externalId: string | null;
  }): Promise<{ inserted: boolean }>;
  /** 完成该 run(status→completed)。 */
  completeRun(runId: string): Promise<void>;
  /**
   * 按 aweme_id 查对应 imported 作品的 publication_id(T-030 D6 回填 F3)。
   * 命中(publications.externalId=aweme_id)返回 publicationId,否则 null(作品未导入/
   * 未发布 → 评论仍落库,只是 publication_id 留空)。**OPTIONAL**:省略该 port 则全部评论
   * publication_id 留空(向后兼容 D2 的纯落库 fake 测试)。
   *
   * F3 诚实边界:audience_signals 表**无 aweme_id 锚**,故只有本次采集(ingest 上下文持有
   * aweme_id)能回填;**存量已入库评论无法回填**,需重采。
   */
  resolvePublicationId?(awemeId: string): Promise<string | null>;
}

export interface IngestCommentsResult {
  runId: string;
  received: number; // 收到评论条数
  written: number; // 实际新写入信号条数
  skipped: number; // 命中去重锚跳过条数(run 内 record_key 或跨 run external_id,T-065)
}

export function commentExternalId(c: CommentRecord): string {
  if (c.commentId) return `douyin:comment:${c.commentId}`;
  const h = createHash("sha256")
    .update(`comment|${c.awemeId}|${c.userId}|${c.userName}|${c.text}`)
    .digest("hex")
    .slice(0, 16);
  return `douyin:comment:h:${h}`;
}

export async function ingestComments(
  awemeId: string,
  records: CommentRecord[],
  deps: {
    ports: CommentIngestPorts;
    externalSourceId: string;
    capturedAt: string;
  },
): Promise<IngestCommentsResult> {
  const { ports, externalSourceId, capturedAt } = deps;
  // 幂等键形如 `${sourceId}:comments:${capturedAt}`(同源同刻复跑取回同一 run)。
  const run = await ports.createRun({
    externalSourceId,
    runType: "douyin_comments",
    idempotencyKey: `${externalSourceId}:comments:${capturedAt}`,
  });
  // 评论按作品可读 (T-030 D6, F3) + 误归属修复 (T-065):按**评论自身的 aweme_id**(XHR
  // payload 携带)解析 publication,退化用本次采集的目标 awemeId。T-065 真机实锤:创作者
  // 中心评论管理页的 `item_id` 过滤不生效(每个作品导航拦到同一份全局评论列表),旧实现
  // 「整批按目标 awemeId 解析一次」把同一条评论归到 73 个不同 publication —— 现改为逐评论
  // 按其真实 aweme_id 归属(按 aweme 缓存,避免重复解析)。无匹配作品 → null,评论仍落库。
  // 省略 resolvePublicationId port(D2 fake 测试)→ 全部留空。
  const pubCache = new Map<string, string | null>();
  const resolvePub = async (aweme: string): Promise<string | null> => {
    if (!ports.resolvePublicationId) return null;
    if (!pubCache.has(aweme)) {
      pubCache.set(aweme, await ports.resolvePublicationId(aweme));
    }
    return pubCache.get(aweme) ?? null;
  };
  let written = 0;
  let skipped = 0;
  for (const c of records) {
    const externalId = commentExternalId(c); // 评论粒度幂等锚(cid 首选,T-065)
    const recordKey = externalId; // run 内 ledger 锚沿用同一 key(cid 路径与旧值一致)
    // 去重锚①:record_key 已在该 run 落过 → 跳过(不重复写信号)。
    if (await ports.recordExists(run.id, recordKey)) {
      skipped += 1;
      continue;
    }
    const { inserted } = await ports.ingestSignal({
      source: "comment", // 既有 enum(不扩 douyin_comment)
      rawText: c.text,
      demandTag: null,
      ingestionRunId: run.id, // C-4 铁律:信号写必带真 run id
      // 按评论自身 aweme_id 归属(payload 无 aweme_id 时 parseCommentList 已回填目标 awemeId)。
      publicationId: await resolvePub(c.awemeId || awemeId),
      likeCount: c.likeCount ?? null, // T-042 热榜排序依据(采集抓的 digg_count)
      externalId, // 去重锚②:跨 run 唯一(user+source+external_id,T-065)
    });
    await ports.markRecordWritten(run.id, recordKey);
    // 去重锚②命中(库里已有该 cid,前次采集写的)→ 计 skipped,不算新写。
    if (inserted) written += 1;
    else skipped += 1;
  }
  await ports.completeRun(run.id);
  return { runId: run.id, received: records.length, written, skipped };
}
