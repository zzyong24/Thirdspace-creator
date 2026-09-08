import { createCollectedWorkAttribution } from "./attribution";
import { ENDPOINTS, type RequestContext, type Transport } from "@creatoros/contract";
import { OwnershipError } from "../../modules/projects";
import { ScheduledFlywheelSuspended, type Collector as ScheduledCollector } from "../../modules/ai-runtime";
import { matchDetailsToPublications, toDetailMetricRecords, visibilityFromDetailStatus, type PublicationCatalogEntry } from "./douyin-work-detail";
import { decideVisibleDouyinCollection } from "./visible-douyin-collection";
import { runDouyinHeavyBackfill } from "./douyin-heavy-backfill";

/** 同账号公开作品采集：确认可见性后写入，再按原任务补齐封面和归因。 */
export function createSelfCollector(ports:{
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"reconcilePlatformWork" | "listImportedWorks" | "getOutputOwnerSummary" | "getProjectOverviewCore">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>,"getRecentPublicationsWithTitle" | "listPublicationsMissingCover" | "setCover">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>,"getPublicationAnalytics" | "getDashboardRollup">;
ingestionService: Pick<ReturnType<typeof import("../../modules/ingestion").createIngestionService>,"ensureDouyinSource" | "ingestApprovedDouyinBatch" | "createRun" | "ingestMetrics" | "completeRun">;
assetsService: Pick<ReturnType<typeof import("../../modules/assets").createAssetsService>,"createGeneratedAsset">;
artifactsService: Pick<ReturnType<typeof import("../../modules/artifacts").createArtifactsService>,"listProjectArtifacts" | "listVersions">;
materialLinksService: () => Pick<ReturnType<typeof import("../../modules/material-links").createMaterialLinksService>,"create">;
topicAttributionService: Pick<ReturnType<typeof import("../../modules/topic-attribution").createTopicAttributionService>,"hasAttribution" | "saveAttribution">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>,"createCandidate" | "patchCandidate">;
learningsService: Pick<ReturnType<typeof import("../../modules/learnings").createLearningsService>,"createLearning">;
positioningService: Pick<ReturnType<typeof import("../../modules/positioning").createPositioningService>,"readPositioningCenter">;
now:()=>string;
models:ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>["models"];
checkScheduledSignal:()=>void;
assertAttributionConfigured:(ctx:RequestContext)=>Promise<unknown>;
makeReviewSubjectReader:()=>import("../../modules/ai-runtime").ReviewSubjectReader;
ai:Transport;
createAiTaskAttemptId:()=>string;
resolveCoverBackfillLimit:()=>number;
configuration:{CREATOROS_TRANSCRIBE_BACKFILL_BATCH_LIMIT?:string;CREATOROS_LEARNING_GROUNDING_MIN_METRICS?:string;CREATOROS_TOPIC_ATTRIBUTION_LIMIT?:string;CREATOROS_ATTRIBUTION_VIRAL_MULTIPLE?:string;CREATOROS_ATTRIBUTION_LOW_MULTIPLE?:string};
readMetrics:(ctx:RequestContext,capturedAt:string)=>Promise<{records:import("../../modules/ingestion").MetricRecord[];identity:Parameters<ReturnType<typeof import("../../modules/ingestion").createIngestionService>["ingestApprovedDouyinBatch"]>[1]["identity"]}>;
readExport:(ctx:RequestContext)=>Promise<Uint8Array>;
readCover:(ctx:RequestContext,awemeId:string)=>Promise<{coverUrl?:string}>;
downloadDouyinImage:(url:string)=>Promise<{bytes:Uint8Array;mimeType:string}>;
parseDouyinWorkListXlsx:(bytes:Uint8Array)=>Promise<import("./douyin-work-detail").DouyinWorkDetail[]>;
}):ScheduledCollector {
const {projectsService,publishingService,analyticsService,ingestionService,assetsService,artifactsService,materialLinksService,topicAttributionService,candidateService,learningsService,positioningService,now,models,checkScheduledSignal,assertAttributionConfigured,makeReviewSubjectReader,ai,createAiTaskAttemptId,resolveCoverBackfillLimit,configuration,readMetrics,readExport,readCover,downloadDouyinImage,parseDouyinWorkListXlsx}=ports;
const readOutput = async (ctx: RequestContext, id: string) => { const owner=await projectsService.getOutputOwnerSummary(ctx,id); if(!owner)throw new OwnershipError(); const {outputs}=await projectsService.getProjectOverviewCore(ctx,owner.projectId); const output=outputs.find(row=>row.id===id); if(!output)throw new OwnershipError(); return output; };
const recentVisibleCollections=new Map<string,{completedAtMs:number;result:Awaited<ReturnType<ScheduledCollector>>}>();
const attributeCollectedWorks=createCollectedWorkAttribution({projectsService,publishingService,analyticsService,topicAttributionService,candidateService,learningsService,positioningService,models,assertAttributionConfigured,makeReviewSubjectReader,configuration});
return async (ctx, target, report) => {
      const collectionCacheKey = `${ctx.userId}:${ctx.accountId ?? "none"}`;
      const cached = recentVisibleCollections.get(collectionCacheKey);
      if (cached && Date.now() - cached.completedAtMs < 30 * 60_000) {
        report({
          stage: "visibility",
          processed: cached.result.itemsNew,
          total: cached.result.itemsNew,
          message: "已复用 30 分钟内同账号的公开作品采集结果",
        });
        return cached.result;
      }
      // [T-152] 阶段①:登录校验 + 确保采集源(导出前 fetchDouyinWorkListExport 内先校验登录态)。
      report({ stage: "login", processed: 0, total: null, message: "校验抖音登录态" });
      const externalSourceId =
        typeof target.externalSourceId === "string" && target.externalSourceId
          ? target.externalSourceId
          : // [T-144] 空 target(job 未绑源)→ ensure 本 user 的真实抖音采集源(无源建、有源
            // 复用),绝不再指已退役的 "src-douyin-canonical"(新库查无 → 抛「外部来源不存在」
            // → runner 报 failed → 采 0 条的根因)。ensure 后 refreshDouyin 能校验通过。
            await ingestionService.ensureDouyinSource(ctx);
      const capturedAt = now();
      const detailCapturedAt = new Date(Date.parse(capturedAt) + 1).toISOString();
      // [T-595] 原始指标先只进内存；禁止在可见性已确认前调用 ingestion 写库。
      report({
        stage: "fetch",
        processed: 0,
        total: null,
        message: "抓取完整作品目录（尚未入库）",
      });
      const rawBatch = await readMetrics(ctx, capturedAt);
      // [T-322] detailWritten 提到 try 外(下方封面回填段 return 读它)。导出→解析→可见性
      //   同步→明细落库整段包 try:任一抛错只 console.error + 报一条 export 降级,**不**
      //   rethrow,让控制流继续到下方 runDouyinHeavyBackfill(封面回填不依赖导出结果,§④修点 A)。
      let detailWritten = 0;
      let metricsWritten = 0;
      try {
        // 1) 抓导出 xlsx bytes(headless 复用扫码登录态;未登录/非 xlsx 抛,run 不建 → 快速失败)。
        // [gate-F7 插装点⑤] creator-center 导出限流(注真单例)。
        // [T-152] 阶段②:导出明细 xlsx(点「刷新数据」+「导出数据」,慢阶段)。
        report({ stage: "export", processed: 0, total: null, message: "导出作品明细数据" });
        const bytes = await readExport(ctx);
        // 2) 解析 16 字段明细(纯,exceljs 读内存 buffer)。
        // [T-152] 阶段③:解析明细(N 条)。
        report({ stage: "parse", processed: 0, total: null, message: "解析明细数据" });
        const details = await parseDouyinWorkListXlsx(bytes);
        // [T-202] 导出/解析条数落 console(不止 job_run progress):真机排「隐藏 0 标」时,先看这行——
        //   details.length===0 → 导出本身 0 条(登录态/tab/导出按钮问题,查上面 debugShot);
        //   details.length>0 但下方 hiddenSynced===0 → 同步/匹配问题(看 [douyin-detail-visibility])。
        console.log(
          `[douyin-detail-export] 解析 xlsx 得 ${details.length} 条明细行(bytes ${bytes.byteLength})`,
        );
        report({
          stage: "parse",
          processed: details.length,
          total: null,
          message: `解析出 ${details.length} 条明细`,
        });
        // 3) 装配作品目录(title + externalId=aweme_id + publishedAt),按 title/pub_date 匹配。
        //    T-034 断裂修复:导入作品(external_id=aweme_id)故意无 revision(见 publishing.repository
        //    createImportedPublication),故 getRecentPublicationsWithTitle 回来的 title 为空 —— 与
        //    L3004 dossier 装配同款回退:revision title 空时取 content_output 真实标题(导入时落在
        //    projects/content_output 上)。不回退 → 72 条采集作品 catalog title 恒空 → xlsx 明细
        //    永远匹配不上 → items_new 恒 0(断裂根因)。
        const pubs = await publishingService.getRecentPublicationsWithTitle(ctx, {
          limit: 500,
        });
        const catalogByExternalId = new Map<string, PublicationCatalogEntry>();
        for (const record of rawBatch.records) {
          catalogByExternalId.set(record.externalId, {
            id: record.externalId,
            platform: record.platform,
            title: record.title ?? "",
            publishedAt: record.publishedAt ?? null,
            externalId: record.externalId,
          });
        }
        for (const p of pubs) {
          if (!p.externalId) continue;
          let title = p.title;
          if (!title) {
            try {
              const out = await readOutput(ctx, p.contentOutputId);
              title = out.title;
            } catch {
              // 防御:取不到作品标题就保持空(该条明细自然匹配不上,诚实跳过)。
            }
          }
          // catalog 的 id 统一使用 externalId，避免同一作品的“原始记录 + 存量 publication”
          // 形成两个候选而被误判多义；存量只补原始记录缺失的标题/发布时间。
          const previous = catalogByExternalId.get(p.externalId);
          catalogByExternalId.set(p.externalId, {
            id: p.externalId,
            platform: p.platform,
            title: previous?.title || title,
            publishedAt: previous?.publishedAt || p.publishedAt,
            externalId: p.externalId,
          });
        }
        const catalog = [...catalogByExternalId.values()];
        const externalIdById = new Map<string, string>();
        for (const item of catalog) {
          if (item.externalId) externalIdById.set(item.id, item.externalId);
        }
        const matches = matchDetailsToPublications(details, catalog);
        const decision = decideVisibleDouyinCollection({
          records: rawBatch.records,
          details,
          catalog,
        });
        const visibleExternalIds = new Set(
          decision.visibleRecords.map((record) => record.externalId),
        );
        report({
          stage: "visibility",
          processed: decision.counts.visible,
          total: decision.counts.observed,
          message:
            `公开 ${decision.counts.visible} · 隐藏 ${decision.counts.hidden} · ` +
            `未知跳过 ${decision.counts.unknown} · 明细未匹配 ${decision.counts.unmatchedDetails}`,
        });

        // 先原子清理明确隐藏的存量平台派生树；任一失败直接抛出，禁止继续入库或跑重活。
        for (const externalId of decision.hiddenExternalIds) {
          await projectsService.reconcilePlatformWork(ctx, {
            platform: "douyin",
            externalId,
            visibility: "hidden",
          });
        }
        checkScheduledSignal();
      const metricsRun = await ingestionService.ingestApprovedDouyinBatch(ctx, {
          externalSourceId,
          capturedAt,
          records: decision.visibleRecords,
          identity: rawBatch.identity,
        });
        metricsWritten = metricsRun.recordsWritten;
        // 3b) [T-073] 平台侧可见性同步:明细「审核状态」列(如「仅自己可见」/「已通过」)
        //     → publication.hidden_at + 导入项目 platform_ref.hidden。判定不了(审核中/
        //     未通过/空)诚实跳过,不动既有标记;找不到承载行也跳过(不硬造)。放在指标
        //     落库之前、且不受 records.length===0 早退影响(隐藏作品也可能产不出 record)。
        // [T-151 缺口 C 诊断] 可见性同步逐档计数 —— 存量真机 hidden_at 全 NULL 的根因需真机 xlsx
        //   才能定位(是 title 匹配不上?还是「审核状态」列没解析到值?还是状态字面量不含隐藏口径?)。
        //   加这组计数 + 采样,让下次真扫**自证根因**(不改数据、不硬猜),诚实分层。
        const visDiag = {
          total: matches.length,
          unmatched: 0, // publicationId=null(title 匹配不上 → T-034 断裂域)
          unknownStatus: 0, // 匹上了但审核状态判不出(列没解析 / 字面量不含隐藏口径)
          noExtId: 0, // 匹上了但无 externalId 锚(fixture 轨)
          hiddenSynced: 0, // 真标了 hidden
          visibleSynced: 0, // 真标了 visible
        };
        const statusSamples = new Set<string>();
        // [T-202] 未匹配明细的「作品标题」采样(锚 = title,匹不上多因 title 断裂 T-034)。真机看到
        //   具体标题 → 立刻能判是 catalog title 空、还是 xlsx 标题被截断/带表情不一致导致匹不上。
        const unmatchedTitleSamples = new Set<string>();
        for (const m of matches) {
          if (!m.publicationId) {
            visDiag.unmatched += 1;
            // 采样未匹配明细的「审核状态」原值 + 「标题」(去重,最多留几个),便于真机比对列/字面量。
            if (statusSamples.size < 8) statusSamples.add(m.detail.status ?? "");
            if (unmatchedTitleSamples.size < 8)
              unmatchedTitleSamples.add(m.detail.title ?? "");
            continue;
          }
          const vis = visibilityFromDetailStatus(m.detail.status);
          if (vis === "unknown") {
            visDiag.unknownStatus += 1;
            if (statusSamples.size < 8) statusSamples.add(m.detail.status ?? "");
            continue;
          }
          const extId = externalIdById.get(m.publicationId);
          if (!extId) {
            visDiag.noExtId += 1;
            continue; // 无 externalId 锚(fixture 轨)→ 跳过
          }
          const hidden = vis === "hidden";
          if (hidden) {
            // 已由上方原子清理链处理；不再回写一份 hidden 标记制造双写真相。
            visDiag.hiddenSynced += 1;
            continue;
          }
          try {
            // [T-595] 旧 hidden_at/platform_ref.hidden 只作迁移兼容；公开归一也由同一
            // Projects 事务协调器一次提交，退役原先三个 service 的 best-effort 双写链。
            await projectsService.reconcilePlatformWork(ctx, {
              platform: "douyin",
              externalId: extId,
              visibility: "visible",
            });
            visDiag.visibleSynced += 1;
          } catch {
            // 可见性同步失败不拖垮整批指标落库(best-effort;下轮采集会再同步)。
          }
        }
        // [缺口 C 诊断] 打印逐档结果 + 未判定明细的审核状态采样。真机看这行即知根因:
        //   unmatched 高 → title 匹配断裂;unknownStatus 高 + 采样非空 → 列/字面量口径需扩;
        //   hidden/visibleSynced 有值 → 同步链本身通(问题只在存量那一次)。
        console.log(
          `[douyin-detail-visibility] 明细 ${visDiag.total}(catalog ${catalog.length} 条作品):未匹配 ${visDiag.unmatched},状态判不出 ${visDiag.unknownStatus},无锚 ${visDiag.noExtId},标隐藏 ${visDiag.hiddenSynced},标可见 ${visDiag.visibleSynced}` +
            (statusSamples.size > 0
              ? ` · 未判定审核状态采样: ${Array.from(statusSamples)
                  .map((s) => JSON.stringify(s))
                  .join(", ")}`
              : "") +
            (unmatchedTitleSamples.size > 0
              ? ` · 未匹配标题采样: ${Array.from(unmatchedTitleSamples)
                  .map((s) => JSON.stringify(s))
                  .join(", ")}`
              : ""),
        );
        // 4) 匹配上的明细 → MetricRecord[](未匹配 / 无 externalId 锚 → 跳过,诚实)。
        const records = toDetailMetricRecords(
          matches,
          (pubId) => {
            const externalId = externalIdById.get(pubId) ?? null;
            return externalId && visibleExternalIds.has(externalId)
              ? externalId
              : null;
          },
          detailCapturedAt,
        );
        // [T-195] records 空(一条都没匹配上)时**不早退**:可见性已在上面同步(hidden_at/
        //   platform_status 已标),缺封面 / 待重建的可见作品仍应跑重活。故只跳过「建空 run」,
        //   下面的初始化重活(封面回填 + 逐字稿/重建)无论 records 是否为空都要跑。
        if (records.length > 0) {
          // [T-152] 阶段④:匹配落库(records.length 条匹配上的明细 → ingestMetrics)。
          report({
            stage: "ingest",
            processed: 0,
            total: records.length,
            message: `匹配落库 ${records.length} 条明细`,
          });
      checkScheduledSignal();
          const run = await ingestionService.createRun(ctx, {
            externalSourceId,
            runType: "douyin_detail",
            idempotencyKey: `${externalSourceId}:detail:${detailCapturedAt}`,
          });
          const result = await ingestionService.ingestMetrics(ctx, {
            runId: run.id,
            records: records as unknown as Array<Record<string, unknown>>,
          });
          await ingestionService.completeRun(ctx, { runId: run.id });
          report({
            stage: "ingest",
            processed: result.recordsWritten,
            total: records.length,
            message: `已落库 ${result.recordsWritten} 条明细`,
          });
          detailWritten = result.recordsWritten;
        }
        // [T-202] 落库条数落 console:与上面 export/visibility 三行拼成完整链路证据
        //   (导出 N 行 → 匹配 M 条 → 落库 detailWritten 条),真机一眼定位断点。
        console.log(
          `[douyin-detail-ingest] 明细落库 ${detailWritten} 条快照(匹配上 ${records.length} 条 record)`,
        );
      } catch (detailErr) {
        // [T-595] 可见性闸门失败必须 fail-closed：不入新作品、不按缺失状态清理，也不继续
        // 跑封面/逐字稿等重活。旧“吞错后继续”会把 unknown 当可见，已正式退役。
        console.error(
          "[douyin-visible-collection] 源可见性确认失败，本轮未入库:",
          detailErr,
        );
        report({
          stage: "export",
          processed: 0,
          total: null,
          message: "可见性无法确认，本轮未入库且未清理",
        });
        throw detailErr;
      }
      // 5) 已确认公开并落库后再跑初始化重活：①封面回填 ②逐字稿 + 重建排队。
      //    隐藏/未知作品从未进入本轮写集合，重活天然只看到公开作品。
      // [T-433 S1] 绑号轻触发:target.__skipHeavyBackfill 时跳过尾部逐条重活(封面/逐字稿/重建),
      //   避免多账号绑号把逐条重活堆进 gate-F5 超长串行队列;重活留次日 daily self.detail(不带此标)
      //   到点幂等补,不漏。明细导出/落库主流程不受影响(coversFilled=0 仅供 return itemsUpdated)。
      const heavy = (target as { __skipHeavyBackfill?: boolean })
        .__skipHeavyBackfill
        ? { coversFilled: 0 }
        : await runDouyinHeavyBackfill(
        ctx,
        {
          // ── 封面回填 host ──────────────────────────────────────────────────
          listPublicationsMissingCover: async (c, limit) =>
            (
              await publishingService.listPublicationsMissingCover(c, {
                platform: "douyin",
                limit,
              })
            ).map((p) => ({
              id: p.id,
              externalId: p.externalId ?? null,
              contentOutputId: p.contentOutputId ?? null,
            })),
          // [T-862/gate-F7] 封面复用组合入口：匿名 iesdouyin 解析失败时才按当前账号
          //   登录态回落 detail；网络/HTTP/冷却错误不双路重试。两条路继续走真网关单例。
          fetchVideoUrl: async (awemeId) =>
            readCover(ctx, awemeId),
          downloadImage: (url) => downloadDouyinImage(url),
          createImageAsset: (c, input) =>
            assetsService.createGeneratedAsset(c, {
              assetType: "image",
              name: input.name,
              bytes: input.bytes,
              mimeType: input.mimeType,
            }),
          setCover: async (c, publicationId, coverAssetId) => {
            await publishingService.setCover(c, publicationId, coverAssetId);
          },
          // [T-151 缺口 B] 封面绑作品所属项目:contentOutputId → getOutput().projectId →
          //   materialLinksService().create(entityType='asset')。素材中心「按项目」可见该封面。
          //   解析不到 project → 诚实跳过;建边失败由本 host 独立吞掉(封面已落是真的)。
          bindCoverToProjectByOutput: async (c, { contentOutputId, coverAssetId }) => {
            const output = await readOutput(c, contentOutputId);
            const projectId = output.projectId;
            if (!projectId) return;
            await materialLinksService().create(c, {
              projectId,
              contentOutputId,
              entityType: "asset",
              entityId: coverAssetId,
              role: "cover",
              stage: "publishing",
              addedByType: "ingestion",
            });
          },
          // ── 逐字稿 + 重建排队 host ─────────────────────────────────────────
          listImportedWorks: (c) => projectsService.listImportedWorks(c),
          // 逐字稿:一批 awemeId 经 ai transport 排一个 transcribe.douyin(dispatch 链拦
          //   ai.tasks.create → runTranscribe;直调 service 会死链)。
          enqueueTranscribe: async (c, awemeIds) => {
            await ai.request(
              ENDPOINTS.createAITask,
              {
                params: undefined,
                query: undefined,
                body: {
                  taskType: "transcribe.douyin",
                  attemptId: createAiTaskAttemptId(),
                  inputData: { awemeIds },
                },
              },
              c,
            );
          },
          // 依赖闸：只有真实 ASR 逐字稿才允许重建；图集占位锚不能喂给重建模型。
          hasReconstructableTranscript: async (c, projectId) => {
            const rows = await artifactsService.listProjectArtifacts(c, projectId);
            for (const row of rows) {
              if (row.artifactType !== "output_script" || !row.currentVersionId) {
                continue;
              }
              const versions = await artifactsService.listVersions(c, row.id);
              const current = versions.find((v) => v.id === row.currentVersionId);
              const data = current?.contentData as
                | Record<string, unknown>
                | null
                | undefined;
              if (
                data?.source !== "image-album" &&
                typeof data?.transcript === "string" &&
                data.transcript.trim().length > 0
              ) {
                return true;
              }
            }
            return false;
          },
          // 闸:该项目是否已有 origin='reconstructed' 的 artifact(重建过了不重跑)。
          hasReconstructedArtifact: async (c, projectId) => {
            const rows = await artifactsService.listProjectArtifacts(c, projectId);
            return rows.some((r) => r.origin === "reconstructed");
          },
          // 重建:经 ai transport 的 ai.tasks.create 起 reconstruct.project(dispatch 链后台跑;
          //   service 从 inputData.projectId 派生幂等键去重 IN-FLIGHT 重复)。
          enqueueReconstruct: async (c, projectId) => {
            await ai.request(
              ENDPOINTS.createAITask,
              {
                params: undefined,
                query: undefined,
                body: {
                  taskType: "reconstruct.project",
                  attemptId: createAiTaskAttemptId(),
                  inputData: { projectId },
                },
              },
              c,
            );
          },
        },
        {
          coverLimit: resolveCoverBackfillLimit(),
          transcribeBatchLimit: (() => {
            const raw = Number(
              configuration.CREATOROS_TRANSCRIBE_BACKFILL_BATCH_LIMIT,
            );
            return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
          })(),
          // [T-152] 封面回填阶段逐条上报进度(M/N;runner 节流到每 ~1.5s 写一次库)。
          onCoverProgress: (doneN, totalN) =>
            report({
              stage: "cover_backfill",
              processed: doneN,
              total: totalN,
              message: `回填封面 ${doneN}/${totalN}`,
            }),
        },
      );
      // 6) [T-235d/T-513] 明细落库后 **best-effort** 触发正向归因回流；必须 await 到当前
      //    scheduled task 的 snapshot/lease 内（失败仍 catch，不把采集主结果改成失败）：
      //    对「有新指标 + 有真逐字稿 + 未归因」
      //    的已发布作品逐条 AI 归因(枚举化,相对本账号基线分层)→ 落 topic_attributions →
      //    next_experiments ≤3/run 进候选池(title 前缀「实验|」,card.attributionId 溯源)。
      //    幂等锚 publication_id;未配文本模型 / 无稿 / 无指标各态诚实跳过(runner 内计数)。
      //    本轮 enqueueTranscribe 排的新逐字稿要到下一轮 self.detail 才可归因(异步,诚实滞后)。
      //    [gate-F1] 与 learnings 零接触:由发布实绩触发,独立表,不互相触发。
      await attributeCollectedWorks(ctx).catch((err) => {
        if(err instanceof ScheduledFlywheelSuspended)throw err;
        console.error(
          "[topic-attribution] 归因回流触发失败(best-effort,不影响明细采集):",
          err,
        );
      });
      // itemsUpdated 承载本轮真回填的封面数(诚实;明细写入数入 itemsNew)。
      const visibleCollectionResult = {
        itemsNew: metricsWritten + detailWritten,
        itemsUpdated: heavy.coversFilled,
      };
      recentVisibleCollections.set(collectionCacheKey, {
        completedAtMs: Date.now(),
        result: visibleCollectionResult,
      });
      return visibleCollectionResult;
    };
}
