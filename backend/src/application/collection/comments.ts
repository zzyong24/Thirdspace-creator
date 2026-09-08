import type { RequestContext } from "@creatoros/contract";
import type { Collector as ScheduledCollector } from "../../modules/ai-runtime";
import { createIngestionRepository } from "../../modules/ingestion";
import { ingestComments, type CommentRecord, type CommentIngestPorts } from "./comment-ingestion";
import { orderCommentCollection, buildCommentCoverageMessage, type CommentCollectionCandidate } from "./comment-collection-plan";
interface CommentReadOptions {maxPages?:number;commentWatermark:(awemeId:string)=>Promise<Set<string>>}
/** 评论增量读取、原入库去重账本与进度组合。 */
export function createCommentsCollector(ports:{db: import("../../db").Db;
deps: {now:()=>string;nextId:(prefix:string)=>string};
checkScheduledSignal:()=>void;
ingestionService: Pick<ReturnType<typeof import("../../modules/ingestion").createIngestionService>,"ensureDouyinSource"|"createRun"|"completeRun">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>,"ingestAudienceSignal"|"listCommentsForPublication">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>,"resolvePublication"|"getRecentPublicationsWithTitle">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>,"getPublicationAnalytics">;
readComments:(ctx:RequestContext,awemeId:string,options:CommentReadOptions)=>Promise<CommentRecord[]>;
readCommentsForWorks:(ctx:RequestContext,awemeIds:string[],options:CommentReadOptions & {onWorkComplete:(work:{awemeId:string;records:CommentRecord[]},progress:{processed:number;total:number})=>Promise<void>})=>Promise<{works:Array<{awemeId:string;records:CommentRecord[]}>;truncated:boolean;cooldownRemainMs:number}>;}):ScheduledCollector {
const {db,deps,checkScheduledSignal,ingestionService,candidateService,publishingService,analyticsService,readComments,readCommentsForWorks}=ports;
return async (ctx, target, report) => {
      // [T-152] 阶段①:登录校验 + 确保采集源(抓评论前 fetchDouyinComments* 内先校验登录态)。
      report({ stage: "login", processed: 0, total: null, message: "校验抖音登录态" });
      const externalSourceId =
        typeof target.externalSourceId === "string" && target.externalSourceId
          ? target.externalSourceId
          : // [T-144] 空 target(job 未绑源)→ ensure 本 user 的真实抖音采集源(无源建、有源
            // 复用),绝不再指已退役的 "src-douyin-canonical"(新库查无 → 抛「外部来源不存在」
            // → runner 报 failed → 采 0 条的根因)。ensure 后 refreshDouyin 能校验通过。
            await ingestionService.ensureDouyinSource(ctx);
      const maxPages =
        typeof target.maxPages === "number" ? target.maxPages : undefined;
      // CommentIngestPorts 真实装配(所有作品共用一套 ports):ingestion repo(去重 ledger)+
      // candidate service(信号写,C-4 骑 ingestion run)+ ingestion service(run 生命周期)。
      const ingestionRepo = createIngestionRepository(db, {
        now: deps.now,
        nextId: deps.nextId,
        userId: ctx.userId,
        // [T-136 §D 切片 c] 评论采集 run/去重 ledger 按当前号(去重锚仍是 run+recordKey,
        //   run 已 stamp 号;这里带号让 repo 门与 service 侧一致)。
        accountId: ctx.accountId ?? null,
      });
      const commentPorts: CommentIngestPorts = {
        createRun: async (input) => {
      checkScheduledSignal();
          const run = await ingestionService.createRun(ctx, {
            externalSourceId: input.externalSourceId,
            runType: input.runType,
            idempotencyKey: input.idempotencyKey,
          });
          return { id: run.id };
        },
        recordExists: (runId, recordKey) =>
          ingestionRepo.recordExists(runId, recordKey),
        markRecordWritten: (runId, recordKey) =>
          ingestionRepo.markRecordResult(runId, recordKey, "written"),
        ingestSignal: async (input) => {
          // C-4:AudienceSignal 写必带 ctx.ingestionRunId(source="ingestion")。
          // [T-136 §D 切片 c] 关键:透传当前号 —— candidateService.ingestAudienceSignal 的
          //   repo 门据 ctx.accountId stamp audience_signals.account_id。漏传 = 评论信号无号
          //   归属(切号看不到该号受众信号 / 串味)。这是手搓 ctx,不经 downstreamCtx,必须显式带。
          const signalCtx: RequestContext = {
            userId: ctx.userId,
            requestId: ctx.requestId,
            source: "ingestion",
            accountId: ctx.accountId ?? null,
            ingestionRunId: input.ingestionRunId,
          };
          const res = await candidateService.ingestAudienceSignal(signalCtx, {
            source: input.source,
            rawText: input.rawText,
            demandTag: input.demandTag,
            // 评论按作品可读 (T-030 D6) — 回填作品绑定(ingestComments 已按评论自身 aweme_id 解析)。
            publicationId: input.publicationId,
            // 评论点赞数 (T-042 热榜排序依据) — 采集抓的 digg_count。
            likeCount: input.likeCount,
            // 评论粒度幂等锚 (T-065) — `douyin:comment:<cid>`;跨 run 唯一,重采不重复入库。
            externalId: input.externalId,
          });
          // inserted=false → 命中跨 run 幂等锚(库里已有该评论),ingestComments 计 skipped。
          return { inserted: res.inserted };
        },
        // 按 aweme_id 查对应作品的 publication_id(T-030 D6 回填,F3):命中 published +
        // external_id=aweme_id 的 publication → id,否则 null(评论仍落库,只是不绑作品)。
        resolvePublicationId: async (aweme: string) => {
          const pub = await publishingService.resolvePublication(ctx, {
            platform: "douyin",
            externalId: aweme,
          });
          return pub?.id ?? null;
        },
        completeRun: async (runId: string) => {
          await ingestionService.completeRun(ctx, { runId });
        },
      };
      // 单作品评论落库(纯 ingest 部分,抓取已由调用方完成;每作品前 100 条由抓取层 maxPages 控)。
      // commentPorts 复用(整批共用一套),ingest 逻辑不变。
      const ingestRecordsForWork = async (
        awemeId: string,
        records: CommentRecord[],
      ): Promise<number> => {
        const capturedAt = deps.now();
        const result = await ingestComments(
          awemeId,
          records,
          {
            externalSourceId,
            capturedAt,
            ports: commentPorts,
          },
        );
        return result.written;
      };
      // [T-177 增量化] 评论 watermark 只读端口:按 awemeId 反查库里该作品已知评论的 externalId 集
      //   (`douyin:comment:<cid>`)。resolvePublication(aweme→pubId) + listCommentsForPublication
      //   (source='comment' AND publication_id=pubId 的信号,externalId 即去重锚)。抓取层据此在倒序
      //   翻页里 early-break(某页评论全 ∈ 该集 → 停)。无匹配作品 / 无已知评论 → 空集 → 退化全量。
      //   limit 取大值(覆盖该作品全量已存评论);该读一次/作品,不在热路径,成本远低于省下的重复滚动。
      const commentWatermark = async (aweme: string): Promise<Set<string>> => {
        const pub = await publishingService.resolvePublication(ctx, {
          platform: "douyin",
          externalId: aweme,
        });
        if (!pub?.id) return new Set<string>();
        const rows = await candidateService.listCommentsForPublication(
          ctx,
          pub.id,
          5000,
        );
        const ids = new Set<string>();
        for (const r of rows) if (r.externalId) ids.add(r.externalId);
        return ids;
      };
      // ① 指定 target.awemeId → 只抓该作品;② 未指定 → 抓「我所有作品」评论:遍历用户所有
      //    douyin publications(external_id=aweme_id),**复用单 browser context 跨作品**
      //    (fetchDouyinCommentsForWorks:openContext 开一次 → 循环内逐作品抓 → close 一次),
      //    取代旧「N 作品 × 各开一个 headless 浏览器」路径。
      const single =
        typeof target.awemeId === "string" && target.awemeId
          ? target.awemeId
          : "";
      if (single) {
        // 单作品仍走单作品抓取路径(fetchDouyinComments 内部 openContext 一次)。
        // [gate-F7 插装点③] creator-center 评论翻页限流(注真单例)。
        // [T-152] 单作品:标进入抓取阶段(1/1)。
        report({
          stage: "comments",
          processed: 0,
          total: 1,
          message: "抓取该作品评论",
        });
        const records = await readComments(ctx, single, {maxPages, commentWatermark});
        const written = await ingestRecordsForWork(single, records);
        report({
          stage: "comments",
          processed: 1,
          total: 1,
          message: `已落库 ${written} 条评论`,
        });
        return { itemsNew: written, itemsUpdated: 0 };
      }
      const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
        limit: 500,
      });
      const douyinPubs = pubs.filter(
        (p) => p.platform === "douyin" && p.externalId,
      );
      // [T-232 断点续采] 逐作品预取 watermark:一石二鸟 ——「已采与否」的判据(非空 = 采过,
      //   复用 T-177 既有机制不新造持久锚)+ 直接喂给抓取层做增量 early-break(免每作品双读)。
      const watermarks = new Map<string, Set<string>>();
      for (const p of douyinPubs) {
        const aweme = p.externalId as string;
        watermarks.set(
          aweme,
          await commentWatermark(aweme).catch(() => new Set<string>()),
        );
      }
      // [T-232 爆款优先] 逐作品取 analytics 最新快照的评论数(采集顺序依据:330 评的先采,
      //   额度别烧在 0 评作品上)。读不到/无快照 → 0(诚实降级排后,不编)。
      const candidates: CommentCollectionCandidate[] = [];
      for (const p of douyinPubs) {
        const aweme = p.externalId as string;
        let commentCount = 0;
        try {
          const pageOfSnapshots = await analyticsService.getPublicationAnalytics(
            ctx,
            p.id,
            1,
            1, // capturedAt 降序 → 第 1 条即最新快照
          );
          const raw = pageOfSnapshots.rows[0]?.rawMetrics as
            | Record<string, unknown>
            | undefined;
          const n = Number(raw?.comments);
          if (Number.isFinite(n) && n > 0) commentCount = n;
        } catch {
          /* 快照读不到 → 0,排序自然靠后 */
        }
        candidates.push({
          awemeId: aweme,
          commentCount,
          collected: (watermarks.get(aweme)?.size ?? 0) > 0,
        });
      }
      // [T-232] 顺序 = 未采优先(断点续采:上轮截断后下轮自动从未采作品继续)→ 组内评论数
      //   降序(爆款优先)。已采作品排后,额度富余时增量补新评论(watermark early-break 保便宜)。
      const awemeIds = orderCommentCollection(candidates);
      // 复用单 context 一次性抓完所有作品评论(未登录 → 一次性抛 DouyinNotLoggedInError,
      // runner catch → needs_reconnect),再逐作品 ingestComments 落库(落库逻辑不变)。
      // [gate-F7 插装点③④] creator-center:每作品 acquire 一次 + 作品内翻页每页 acquire(注真单例)。
      // [T-152] 标进入抓取阶段(总作品数已知 → total=awemeIds.length)。
      report({
        stage: "comments",
        processed: 0,
        total: awemeIds.length,
        message: `抓取 ${awemeIds.length} 个作品的评论(未采/爆款优先)`,
      });
      let total = 0;
      // [T-232 额度断点] 抓取层撞 DouyinCooldownActiveError → 立即停剩余作品,带回部分结果
      //   (truncated=true);不再逐作品白撞冷却。
      const batch = await readCommentsForWorks(ctx, awemeIds, {
          maxPages,
          // [T-177] 每作品增量 early-break(预取缓存版;缺失键退化空集全量)。
          commentWatermark: async (aweme) =>
            watermarks.get(aweme) ?? new Set<string>(),
          // T-616：抓完一个作品立即落库并上报，不再等 51 个作品整批返回后才从 0 跳到 N。
          onWorkComplete: async ({ awemeId, records }, progress) => {
            total += await ingestRecordsForWork(awemeId, records);
            report({
              stage: "comments",
              processed: progress.processed,
              total: progress.total,
              message:
                `已处理 ${progress.processed}/${progress.total} 个作品` +
                ` · 累计 ${total} 条评论`,
            });
          },
        });
      // [T-232 run 诚实] 全量完成 vs 额度截断,message 走 CollectResult.message(T-235a 既有
      //   机制,runner 拼进合成 step 文本供运行详情展示);itemsNew 照实,不假装全量。
      const coverageMessage = buildCommentCoverageMessage({
        collectedWorks: batch.works.length,
        totalWorks: awemeIds.length,
        truncated: batch.truncated,
        cooldownRemainMs: batch.cooldownRemainMs,
      });
      report({
        stage: "comments",
        processed: batch.works.length,
        total: awemeIds.length,
        message: coverageMessage,
      });
      return { itemsNew: total, itemsUpdated: 0, message: coverageMessage };
    };
}
