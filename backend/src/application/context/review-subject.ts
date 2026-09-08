import type { RequestContext } from "@creatoros/contract";
import type { ReviewSubjectReader } from "../../modules/ai-runtime";
/** 共享业务上下文读取；聊天和持久生成消费同一投影。 */
export function createReviewSubjectContext(ports: {
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"getProject" | "listOutputIdsByProject">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>,"listPublications">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>,"getPublicationAnalytics">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>,"listCommentsForPublication">;
artifactsService: Pick<ReturnType<typeof import("../../modules/artifacts").createArtifactsService>,"listProjectArtifacts" | "listVersions">;
selectReadableProjectScriptArtifact: (rows: Awaited<ReturnType<import("../../modules/artifacts").ArtifactsService["listProjectArtifacts"]>>) => Awaited<ReturnType<import("../../modules/artifacts").ArtifactsService["listProjectArtifacts"]>>[number] | null | undefined;
readProjectRadarDraftSeed: (ctx: RequestContext, projectId: string) => Promise<string | null>;
}) {
const {projectsService,publishingService,analyticsService,candidateService,artifactsService,selectReadableProjectScriptArtifact,readProjectRadarDraftSeed}=ports;
return ((): ReviewSubjectReader => ({
    // 本作品真标题 —— projectsRepo.get 顺带做 ownership 门(跨用户/未知 → OwnershipError)。
    getTitle: async (c, projectId) => {
      try {
        const row = await projectsService.getProject(c, projectId);
        return row.title ?? "";
      } catch {
        return "";
      }
    },
    // 本作品真文案 —— 新项目只读 output_script；旧项目在 output_script 尚无正式版本时，
    // 兼容读取 master_script。正文仍按 transcript 优先、contentText 回退。
    getScript: async (c, projectId) => {
      try {
        const rows = await artifactsService.listProjectArtifacts(c, projectId);

        const scriptArtifact = selectReadableProjectScriptArtifact(rows);
        if (scriptArtifact?.currentVersionId) {
          const version = (await artifactsService.listVersions(c, scriptArtifact.id)).find(version => version.id === scriptArtifact.currentVersionId)!;
          const data = version.contentData as
            | Record<string, unknown>
            | null
            | undefined;
          const t =
            data && typeof data.transcript === "string"
              ? data.transcript
              : version.contentText;
          // 一旦正式版本存在，它就是唯一正文真相；用户主动保存空稿时也不回灌 seed。
          return t?.trim() ? t : "";
        }
        return (await readProjectRadarDraftSeed(c, projectId)) ?? "";
      } catch {
        return "";
      }
    },
    // 本作品真实数据摘要 —— 解析项目 outputs → publications → 最新 snapshot rawMetrics,合并成
    // 人类可读串(播放优先 views 回退 plays,与 dashboard/getMetricsSummary 同口径)。数据是真实值。
    getMetricsSummary: async (c, projectId) => {
      try {
        const outputIds = await projectsService.listOutputIdsByProject(
          c,
          projectId,
        );
        const merged = new Map<string, number>();
        for (const outputId of outputIds) {
          let pubs: Array<{ id: string }> = [];
          try {
            pubs = await publishingService.listPublications(c, outputId, {
              limit: 20,
              offset: 0,
            });
          } catch {
            pubs = [];
          }
          for (const pub of pubs) {
            try {
              const page = await analyticsService.getPublicationAnalytics(
                c,
                pub.id,
                1,
                10,
              );
              const latest = page.rows
                .slice()
                .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
              const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
              for (const [k, v] of Object.entries(raw)) {
                if (typeof v === "number" && Number.isFinite(v)) {
                  merged.set(k, v);
                }
              }
            } catch {
              /* single publication read failing → skip, never crash */
            }
          }
        }
        if (merged.size === 0) return "";
        // 播放量归一(views/plays 同义合并,只呈现一次;views 真采集优先)。
        if (merged.has("views") && merged.has("plays")) merged.delete("plays");
        const LABELS: Record<string, string> = {
          views: "播放",
          plays: "播放",
          likes: "点赞",
          digg: "点赞",
          comments: "评论",
          shares: "分享",
          favorites: "收藏",
          finish_rate: "完播率",
        };
        return Array.from(merged.entries())
          .map(([k, v]) => `${LABELS[k] ?? k}：${v}`)
          .join(" · ");
      } catch {
        return "";
      }
    },
    // [T-182b] 本作品观众评论 —— 走 per-work 归属查询(不再账号级内存筛)。project → outputs →
    // 逐 publication 调 listCommentsForPublication(source='comment' AND publication_id=pubId,
    // 已按点赞热榜倒序)→ 合并取前 limit 条。与 getMetricsSummary 同一 project→outputs→pubs 装配
    // 口径,零 schema 变更(per-work 外键与查询已建齐)。无 publication / 读失败 → 诚实空兜底。
    getComments: async (c, projectId, opts) => {
      try {
        const outputIds = await projectsService.listOutputIdsByProject(
          c,
          projectId,
        );
        const comments: string[] = [];
        for (const outputId of outputIds) {
          let pubs: Array<{ id: string }> = [];
          try {
            pubs = await publishingService.listPublications(c, outputId, {
              limit: 20,
              offset: 0,
            });
          } catch {
            pubs = []; // 单 output 的 publication 读失败 → 跳过,不牵连其它、不崩
          }
          for (const pub of pubs) {
            if (comments.length >= opts.limit) break;
            try {
              const rows = await candidateService.listCommentsForPublication(
                c,
                pub.id,
                opts.limit,
              );
              for (const r of rows) {
                if (typeof r.rawText === "string" && r.rawText.trim() !== "") {
                  comments.push(r.rawText);
                }
              }
            } catch {
              /* 单 publication 评论读失败 → skip, never crash */
            }
          }
          if (comments.length >= opts.limit) break;
        }
        return comments.slice(0, opts.limit);
      } catch {
        return [];
      }
    },
  }))();
}
