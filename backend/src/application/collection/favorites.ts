import type { RequestContext } from "@creatoros/contract";
import { runFavoritesDistill, ScheduledFlywheelSuspended, type Collector as ScheduledCollector } from "../../modules/ai-runtime";
/** 采集业务组合；宿主只注入真实资源读取，模型沿原任务执行权。 */
export function createFavoritesCollector(ports:{
favoritesService: Pick<ReturnType<typeof import("../../modules/favorites").createFavoritesService>,"listEnabledFolders" | "updateFolderSync" | "recordItems" | "listPendingItems" | "markItemPromoted" | "listItemsForDistill" | "saveTranscript" | "saveDistillVerdict">;
intelligenceService: Pick<ReturnType<typeof import("../../modules/intelligence").createIntelligenceService>,"isLegacySignalSourceWriteFenced">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>,"createCandidate">;
now: () => string;
models: ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>["models"];
readFolders: (ctx: RequestContext) => Promise<Array<{name:string;collectsId:string}>>;
readVideos: (ctx: RequestContext, collectsId:string) => Promise<Array<{awemeId:string;description:string;authorNickname:string}>>;
isNotLoggedInError: (error: unknown) => boolean;
FAVORITES_PROMOTE_PER_RUN: number;
}): ScheduledCollector {
const {favoritesService,intelligenceService,candidateService,now,models,readFolders,readVideos,isNotLoggedInError,FAVORITES_PROMOTE_PER_RUN}=ports;
return async (ctx, _target, report) => {
      if (await intelligenceService.isLegacySignalSourceWriteFenced(ctx)) {
        report({
          stage: "retired",
          processed: 0,
          total: 0,
          message: "旧收藏夹采集已退役；请在内容雷达使用“我的收藏”。",
        });
        return {
          itemsNew: 0,
          itemsUpdated: 0,
          message: "旧收藏夹采集已退役；收藏作品统一由内容雷达建档。",
        };
      }
      report({ stage: "favorites", processed: 0, total: null, message: "读取登记的收藏夹" });
      const folders = await favoritesService.listEnabledFolders(ctx);
      if (folders.length === 0) {
        // 诚实降级(照 benchmark collector 空源 0 跑风格):没登记 = 没开这路信号,引导去登记。
        return {
          itemsNew: 0,
          itemsUpdated: 0,
          message:
            "未指定收藏夹：请在内容雷达添加“我的收藏”来源；旧收藏夹自动化已进入迁移兼容期。",
        };
      }

      // ① 拉本人收藏夹列表(未登录在此抛 DouyinNotLoggedInError → needs_reconnect;验证码返空)。
      report({ stage: "favorites", processed: 0, total: folders.length, message: "拉取抖音收藏夹列表" });
      const remoteFolders = await readFolders(ctx);
      const remoteByName = new Map(remoteFolders.map((f) => [f.name, f]));

      // ② 按 name 精确匹配登记夹;匹配到回填 collectsId + lastSyncedAt,匹配不到记 message 点名。
      const messages: string[] = [];
      const matched: { id: string; name: string; collectsId: string }[] = [];
      for (const folder of folders) {
        const remote = remoteByName.get(folder.name);
        if (!remote) {
          messages.push(
            `抖音上找不到收藏夹「${folder.name}」,请在抖音建同名夹或改登记名`,
          );
          continue;
        }
        matched.push({ id: folder.id, name: folder.name, collectsId: remote.collectsId });
        try {
          await favoritesService.updateFolderSync(ctx, folder.id, {
            collectsId: remote.collectsId,
            lastSyncedAt: now(),
          });
        } catch {
          // 回填失败只丢诊断字段(下轮重匹配即可),不阻断该夹采集。
          console.error(
            "[favorites] request_failed",
            JSON.stringify({
              category: "folder_sync",
              requestId: ctx.requestId,
              traceId: null,
              accountId: ctx.accountId,
            }),
          );
        }
      }

      // ③ 逐匹配夹拉视频 → 幂等落台账(单夹失败跳过不崩整批;未登录仍上抛保持 needs_reconnect)。
      let recordedNew = 0;
      for (let i = 0; i < matched.length; i++) {
        const folder = matched[i]!;
        report({
          stage: "favorites",
          processed: i,
          total: matched.length,
          message: `采集收藏夹「${folder.name}」`,
        });
        try {
          const videos = await readVideos(ctx, folder.collectsId);
          const { recordedNew: n } = await favoritesService.recordItems(
            ctx,
            folder.id,
            videos.map((v) => ({
              awemeId: v.awemeId,
              // title = desc 截 80(展示/进池标题;空 desc 进池侧再兜「收藏夹视频」)。
              title: v.description.slice(0, 80),
              authorNickname: v.authorNickname,
              url: `https://www.douyin.com/video/${v.awemeId}`,
            })),
          );
          recordedNew += n;
        } catch (err) {
          if (isNotLoggedInError(err)) throw err; // 登录态断 → needs_reconnect
          // 单夹失败(验证码外的网络/解析)→ 跳过该夹,不崩整批(诚实记错,同 benchmark 单源纪律)。
          console.error(
            "[favorites] folder_ingest_failed",
            JSON.stringify({
              category: "service",
              requestId: ctx.requestId,
              traceId: null,
              accountId: ctx.accountId,
            }),
          );
          messages.push(`收藏夹「${folder.name}」本次采集失败,已跳过`);
        }
      }

      // ④ 进池:pending 台账 FIFO → createCandidate(source=favorites)→ 标 promoted。单条失败跳过
      //   (候选门失败不吞台账;下轮 pending 仍在)。
      //   [T-278] 上限 3→50:收藏夹是**用户亲手挑的**,不是自动发现的信息流(benchmark/darkhorse
      //   那种才需 ≤3/run「防灌库」)。3/run + 每天只跑一次 → 用户存 13 条要 ~5 天才全进池,实测
      //   「采集 13 条但今日新选题只见 3 条」的根因。50 = 匹配单夹抓取上限 ≤50/夹,一轮把用户新存
      //   的全部进池,当天即见。
      const folderNameById = new Map(folders.map((f) => [f.id, f.name]));
      const pending = await favoritesService.listPendingItems(
        ctx,
        FAVORITES_PROMOTE_PER_RUN,
      );
      let promoted = 0;
      for (const item of pending) {
        const folderName = folderNameById.get(item.folderId) ?? "收藏夹";
        try {
          const cand = await candidateService.createCandidate(ctx, {
            title: item.title || "收藏夹视频",
            angle: `收藏夹「${folderName}」跟拍参考 · @${item.authorNickname || "未知作者"} · ${item.url}`,
            source: "favorites",
          });
          await favoritesService.markItemPromoted(ctx, item.id, cand.id);
          promoted += 1;
        } catch {
          console.error(
            "[favorites] request_failed",
            JSON.stringify({
              category: "candidate_promotion",
              requestId: ctx.requestId,
              traceId: null,
              accountId: ctx.accountId,
            }),
          );
        }
      }

      // ⑤ [T-235d-distill] 蒸馏链(best-effort,采集主流程绝不受影响):transcribe→判库→知识蒸馏确认门。
      //   与④进池路径**正交**:一条收藏既是跟拍候选(④),又可判知识(⑤)——各答各的问题,不去重。
      //   **origin 隔离**:逐字稿落 favorites_items.transcript,**永不建 imported project/artifact**
      //   (见 favorites-distill-runner);故 transcribeOne 复用 transcribe 原语但**不**走 ensureTranscriptArtifact。
      //   ≤3/run(runner 默认)防超载;整体 try/catch 兜底(runner 内已 best-effort 逐条,这里再保一层)。
      let distilled = { processed: 0, knowledge: 0, topic: 0, skip: 0, failed: 0 };
      try {
        distilled = await runFavoritesDistill(ctx, {
          listItemsForDistill: (c, limit) =>
            favoritesService.listItemsForDistill(c, limit),
          saveTranscript: (c, itemId, t) =>
            favoritesService.saveTranscript(c, itemId, t),
          saveVerdict: (c, itemId, v) =>
            favoritesService.saveDistillVerdict(c, itemId, v),
          // 同原定时任务 claim 逐作品执行 ASR，图集仍返回 null。
          transcribeOne: models.transcribeOne,
          // 判库(favorites.triage)+ 知识蒸馏(knowledge.distill)—— capability 经 model-config 解析,不写死。
          triage: models.triage,
          distillKnowledge: models.distillKnowledge,
        });
      } catch (error) {
        if(error instanceof ScheduledFlywheelSuspended)throw error;
        // 蒸馏链整体失败(不该发生;runner 内已逐条 best-effort)→ 记日志,采集主流程照常返回。
        console.error(
          "[favorites] request_failed",
          JSON.stringify({
            category: "distillation",
            requestId: ctx.requestId,
            traceId: null,
            accountId: ctx.accountId,
          }),
        );
      }

      const distillNote =
        distilled.processed > 0
          ? `,蒸馏 ${distilled.processed} 条(知识 ${distilled.knowledge}/选题 ${distilled.topic}/跳过 ${distilled.skip}/失败 ${distilled.failed})`
          : "";
      report({
        stage: "favorites",
        processed: matched.length,
        total: matched.length,
        message: `收藏夹采集完成:台账新增 ${recordedNew} 条,进池 ${promoted} 条${distillNote}`,
      });
      // itemsNew=台账真新增;itemsUpdated=本轮真进池数(诚实);message 汇总匹配失败/引导。
      return {
        itemsNew: recordedNew,
        itemsUpdated: promoted,
        message: messages.length > 0 ? messages.join(";") : undefined,
      };
    };
}
