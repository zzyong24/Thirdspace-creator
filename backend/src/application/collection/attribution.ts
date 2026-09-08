import type { RequestContext } from "@creatoros/contract";
import { runTopicAttribution, assembleCreativeContext } from "../../modules/ai-runtime";
import { OwnershipError } from "../../modules/projects";
/** 已发布作品归因回流；沿采集原模型阶段与原候选服务。 */
export function createCollectedWorkAttribution(ports:{
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"reconcilePlatformWork" | "listImportedWorks" | "getOutputOwnerSummary" | "getProjectOverviewCore">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>,"getRecentPublicationsWithTitle" | "listPublicationsMissingCover" | "setCover">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>,"getPublicationAnalytics" | "getDashboardRollup">;
topicAttributionService: Pick<ReturnType<typeof import("../../modules/topic-attribution").createTopicAttributionService>,"hasAttribution" | "saveAttribution">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>,"createCandidate" | "patchCandidate">;
learningsService: Pick<ReturnType<typeof import("../../modules/learnings").createLearningsService>,"createLearning">;
positioningService: Pick<ReturnType<typeof import("../../modules/positioning").createPositioningService>,"readPositioningCenter">;
models:ReturnType<typeof import("../../modules/ai-runtime").createScheduledFlywheelExecutionService>["models"];
assertAttributionConfigured:(ctx:RequestContext)=>Promise<unknown>;
makeReviewSubjectReader:()=>import("../../modules/ai-runtime").ReviewSubjectReader;
configuration:{CREATOROS_TRANSCRIBE_BACKFILL_BATCH_LIMIT?:string;CREATOROS_LEARNING_GROUNDING_MIN_METRICS?:string;CREATOROS_TOPIC_ATTRIBUTION_LIMIT?:string;CREATOROS_ATTRIBUTION_VIRAL_MULTIPLE?:string;CREATOROS_ATTRIBUTION_LOW_MULTIPLE?:string};
}) {
const {projectsService,publishingService,analyticsService,topicAttributionService,candidateService,learningsService,positioningService,models,assertAttributionConfigured,makeReviewSubjectReader,configuration}=ports;
const readOutput = async (ctx: RequestContext, id: string) => { const owner=await projectsService.getOutputOwnerSummary(ctx,id); if(!owner)throw new OwnershipError(); const {outputs}=await projectsService.getProjectOverviewCore(ctx,owner.projectId); const output=outputs.find(row=>row.id===id); if(!output)throw new OwnershipError(); return output; };
return (ctx:RequestContext)=>runTopicAttribution(ctx, {
        // 未配文本模型 → 整轮诚实跳过(resolveModelSpec 抛 = 未配;闭包引用,无 TDZ,同 topic.daily)。
        isModelConfigured: async (c) => {
          try {
            await assertAttributionConfigured(c);
            return true;
          } catch {
            return false;
          }
        },
        // 候选作品:近期已发布 + 解析 projectId(output → project;导入作品的
        // title 回退 content_output 真实标题,与上方 catalog 装配同款回退)。单条解析失败跳过。
        listWorks: async (c, limit) => {
          const recent = await publishingService.getRecentPublicationsWithTitle(
            c,
            { limit },
          );
          const works: Array<{
            publicationId: string;
            projectId: string | null;
            title: string;
          }> = [];
          for (const p of recent) {
            let projectId: string | null = null;
            let title = p.title;
            try {
              const out = await readOutput(c, p.contentOutputId);
              projectId = out.projectId ?? null;
              if (!title) title = out.title;
            } catch {
              /* output 读不到 → projectId null(runner 按无稿跳过,诚实) */
            }
            works.push({ publicationId: p.id, projectId, title: title ?? "" });
          }
          return works;
        },
        hasAttribution: (c, publicationId) =>
          topicAttributionService.hasAttribution(c, publicationId),
        // 真逐字稿:output_script contentData.transcript(与复盘 reader getScript 同一读法,T-225 管线)。
        getTranscript: (c, projectId) =>
          makeReviewSubjectReader().getScript(c, projectId),
        // 该作品最新指标(最新 metric_snapshot rawMetrics;播放归一 views??plays)。无快照 → null。
        getMetrics: async (c, publicationId) => {
          const page = await analyticsService.getPublicationAnalytics(
            c,
            publicationId,
            1,
            10,
          );
          const latest = page.rows
            .slice()
            .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
          if (!latest) return null;
          const raw: Record<string, number> = {};
          for (const [k, v] of Object.entries(
            (latest.rawMetrics ?? {}) as Record<string, unknown>,
          )) {
            const n = typeof v === "number" ? v : Number(v);
            if (Number.isFinite(n)) raw[k] = n;
          }
          const plays = raw.views ?? raw.plays ?? null;
          const likes = raw.likes ?? null;
          return { plays, likes, raw };
        },
        // 本账号基线 = 各发布最新快照的播放/赞均值(dashboard rollup 现成口径,latest-per-publication)。
        getAccountBaseline: async (c) => {
          const rollup = await analyticsService.getDashboardRollup(c);
          if (rollup.snapshotCount === 0) return null;
          return {
            avgPlays:
              rollup.plays > 0 ? rollup.plays / rollup.snapshotCount : null,
            avgLikes:
              rollup.likes > 0 ? rollup.likes / rollup.snapshotCount : null,
          };
        },
        getPositioningBrief: async (c) => {
          try {
            const cc = await assembleCreativeContext(
              c,
              { projectId: null, topic: "" },
              {
                positioning: {
                  getPositioningCenter: (c2) =>
                    positioningService.readPositioningCenter(c2),
                },
              },
            );
            return cc.positioningBrief;
          } catch {
            return "";
          }
        },
        attribute: models.attribute,
        saveAttribution: async (c, input) => {
          const saved = await topicAttributionService.saveAttribution(c, input);
          return { id: saved.id };
        },
        // 实验候选进池:source 用现有枚举里语义最近的 demand(回流实验 = 账号自证的需求信号);
        // card.attributionId 溯源(additive 字段,UI「实验」徽标点开看归因依据)。
        createExperimentCandidate: async (c, input) => {
          const cand = await candidateService.createCandidate(c, {
            title: input.title,
            angle: input.angle,
            source: "demand",
          });
          try {
            await candidateService.patchCandidate(c, cand.id, {
              card: { attributionId: input.attributionId },
            });
          } catch (e) {
            // 溯源 patch 失败只丢角标(候选已进池是真的),不崩进池。
            console.error(
              `[topic-attribution] 实验候选 ${cand.id} 归因溯源 patch 失败(候选已进池):`,
              e,
            );
          }
          return { id: cand.id };
        },
        // [T-284b G2 / T-284c G3-A] 可复用公式回流成 learning(复用 learnings 管线)。
        // attribution 只在「已发布 + 有真实指标 + 有真逐字稿」作品跑,故其经验天然扎在真实发布
        // 数据上 → evidenceStrength='grounded' → learningsService 直接落 validated 自动进生成
        // (守宪法②第二道闸唯一放开口:只放行客观真实数据背书,不放 AI 空想)。best-effort。
        createLearning: async (c, input) => {
          await learningsService.createLearning(c, {
            title: input.title,
            insight: input.insight,
            learningType: input.learningType,
            evidenceStrength: input.evidenceStrength,
          });
        },
        // grounded 判据阈值 N(真实指标条数下限;env 配置化,默认 1)。
        groundingMinMetrics: (() => {
          const n = Number(configuration.CREATOROS_LEARNING_GROUNDING_MIN_METRICS);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
        })(),
        // 单轮归因上限(省 token,默认 3;env 配置化)。
        maxWorksPerRun: (() => {
          const n = Number(configuration.CREATOROS_TOPIC_ATTRIBUTION_LIMIT);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
        })(),
        // 分层阈值配置化(默认 ≥3x 爆款 / ≤0.5x 低表现)。
        tierThresholds: {
          viralMultiple: (() => {
            const n = Number(configuration.CREATOROS_ATTRIBUTION_VIRAL_MULTIPLE);
            return Number.isFinite(n) && n > 0 ? n : undefined;
          })(),
          lowMultiple: (() => {
            const n = Number(configuration.CREATOROS_ATTRIBUTION_LOW_MULTIPLE);
            return Number.isFinite(n) && n > 0 ? n : undefined;
          })(),
        },
      });
}
