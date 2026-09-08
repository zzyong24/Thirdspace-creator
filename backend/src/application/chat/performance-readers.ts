import type { RequestContext } from "@creatoros/contract";
import type { ContextReaders } from "../../modules/ai-runtime";
import { knowledgeRelevanceScore } from "../../modules/ai-runtime";
import { OwnershipError } from "../../modules/projects";

/** 通过公开服务组合performance读取；不持有数据库或任务执行权。 */
export function createChatPerformanceReaders(ports: {
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>, "listOutputIdsByProject" | "getProjectOverviewCore" | "getOutputOwnerSummary">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>, "getRecentPublicationsWithTitle" | "listPublications">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>, "getPublicationAnalytics">;
learningsService: Pick<ReturnType<typeof import("../../modules/learnings").createLearningsService>, "listLearnings">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>, "listSignals" | "listCandidates">;
platformAccountService: Pick<ReturnType<typeof import("../../modules/platform-account").createPlatformAccountService>, "listAccounts">;
positioningService: Pick<ReturnType<typeof import("../../modules/positioning").createPositioningService>, "readPositioningCenter">;
calibrationService: Pick<ReturnType<typeof import("../../modules/calibration").createCalibrationService>, "getCurrentRubricVersion" | "getOverview">;
canonicalRubricIdFor: (ctx: RequestContext) => string;
}): Pick<ContextReaders,"listComments" | "getPositioningDetail" | "listPublications" | "getMetrics" | "listLearnings" | "listCandidates" | "getPredictions"> {
 const {projectsService,publishingService,analyticsService,learningsService,candidateService,platformAccountService,positioningService,calibrationService,canonicalRubricIdFor}=ports;
const readProject = async (ctx: RequestContext, id: string) => (await projectsService.getProjectOverviewCore(ctx,id)).project;
const readOutput = async (ctx: RequestContext, id: string) => { const owner=await projectsService.getOutputOwnerSummary(ctx,id); if(!owner)throw new OwnershipError(); const {outputs}=await projectsService.getProjectOverviewCore(ctx,owner.projectId); const output=outputs.find(row=>row.id===id); if(!output)throw new OwnershipError(); return output; };

return {
listComments: async (
        c: RequestContext,
        opts: { limit: number; offset: number },
      ) => {
        const { rows, total } = await candidateService.listSignals(c, {
          source: "comment",
          limit: opts.limit,
          offset: opts.offset,
        });
        return {
          total,
          rows: rows.map((r) => ({
            text: r.rawText,
            likeCount: r.likeCount ?? null,
            source: r.source,
            createdAt: r.createdAt,
          })),
        };
      },
getPositioningDetail: async (c: RequestContext) => {
        const center = await positioningService.readPositioningCenter(c);
        const p = center.profile;
        const facets = (p?.facets ?? {}) as Record<string, string>;
        const rules = (p?.downstreamRules ?? {}) as Record<string, string>;
        let accounts: Array<{
          platform: string;
          accountHandle: string;
          followerBaseline: number;
          current?: boolean;
        }> = [];
        try {
          const res = await platformAccountService.listAccounts(c, {
            limit: 100,
            offset: 0,
          });
          accounts = res.rows.map((a) => ({
            platform: a.platform,
            accountHandle: a.accountHandle,
            followerBaseline: a.followerBaseline,
            // [T-382] 当前选中号标注(ctx.accountId 已验属主)—— 模型读工具结果时能直接
            // 回答「我当前登录的是哪个账号」,不再把两个号当并列无主态。
            ...(c.accountId != null && a.id === c.accountId
              ? { current: true }
              : {}),
          }));
        } catch {
          accounts = [];
        }
        return {
          profile: p
            ? {
                persona: p.persona,
                field: p.field,
                audience: p.audience,
                differentiation: p.differentiation,
                capabilities: p.capabilities,
                facets: {
                  contentScope: facets.contentScope || undefined,
                  avoid: facets.avoid || undefined,
                  corePain: facets.corePain || undefined,
                  coreValue: facets.coreValue || undefined,
                  tone: facets.tone || undefined,
                  statusNote: facets.statusNote || undefined,
                },
                downstreamRules: {
                  topicRule: rules.topicRule || undefined,
                  scriptRule: rules.scriptRule || undefined,
                  projectRule: rules.projectRule || undefined,
                  forbidRule: rules.forbidRule || undefined,
                  expressionRule: rules.expressionRule || undefined,
                },
              }
            : null,
          currentStatement: center.currentStatement
            ? {
                oneLiner: center.currentStatement.oneLiner,
                keywords: center.currentStatement.keywords,
              }
            : null,
          statementCount: Array.isArray(center.history)
            ? center.history.length
            : null,
          accounts,
        };
      },
listPublications: async (
        c: RequestContext,
        opts: {
          limit: number;
          offset: number;
          view?: "published_cover_candidates";
        },
      ) => {
        try {
          if (opts.view === "published_cover_candidates") {
            // SEMANTIC_BOUNDARY_ALLOW:这里只筛真实状态/时间/coverAssetId 并按时间排序；
            // “哪个最关联”由编导模型结合当前创作上下文判断，不在代码里做关键词相似度。
            const eligible: Awaited<
              ReturnType<typeof publishingService.getRecentPublicationsWithTitle>
            > = [];
            let offset = 0;
            const pageSize = 50;
            while (eligible.length < opts.limit) {
              const page = await publishingService.getRecentPublicationsWithTitle(c, {
                limit: pageSize,
                offset,
              });
              eligible.push(
                ...page.filter(
                  (publication) =>
                    publication.status === "published" &&
                    Boolean(publication.publishedAt) &&
                    Boolean(publication.coverAssetId),
                ),
              );
              if (page.length < pageSize) break;
              offset += page.length;
            }
            const rows = eligible
              .sort((a, b) =>
                (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
              )
              .slice(0, opts.limit);
            return {
              rows: rows.map((p) => ({
                id: p.id,
                platform: p.platform,
                url: p.externalUrl ?? null,
                publishedAt: p.publishedAt ?? null,
                projectTitle: p.title ?? "",
                coverAssetId: p.coverAssetId ?? null,
                status: p.status,
              })),
              total: rows.length,
            };
          }
          const probe = await publishingService.getRecentPublicationsWithTitle(c, {
            limit: opts.limit + 1,
            offset: opts.offset,
          });
          const hasMore = probe.length > opts.limit;
          const page = probe.slice(0, opts.limit);
          return {
            rows: page.map((p) => ({
              id: p.id,
              platform: p.platform,
              url: p.externalUrl ?? null,
              publishedAt: p.publishedAt ?? null,
              projectTitle: p.title ?? "",
              coverAssetId: p.coverAssetId ?? null,
              status: p.status,
            })),
            // total 下界:本页起点 + 本页条数 (+1 当还有更多)。工具 hasMore 精确,total 诚实近似。
            total: opts.offset + page.length + (hasMore ? 1 : 0),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
getMetrics: async (
        c: RequestContext,
        opts: { projectId?: string; limit: number },
      ) => {
        // 从一条 publication 的最新 snapshot rawMetrics 抽 4 项核心指标(views??plays 归一)。
        const metricsOfPublication = async (
          publicationId: string,
        ): Promise<{
          plays: number | null;
          likes: number | null;
          comments: number | null;
          shares: number | null;
        }> => {
          try {
            const page = await analyticsService.getPublicationAnalytics(
              c,
              publicationId,
              1,
              10,
            );
            const latest = page.rows
              .slice()
              .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
            const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
            const num = (k: string): number | null => {
              const v = raw[k];
              return typeof v === "number" && Number.isFinite(v) ? v : null;
            };
            return {
              plays: num("views") ?? num("plays"),
              likes: num("likes") ?? num("digg"),
              comments: num("comments"),
              shares: num("shares"),
            };
          } catch {
            return { plays: null, likes: null, comments: null, shares: null };
          }
        };
        // 单作品模式:该项目 outputs → publications,合并各 publication 最新 snapshot(取有值者)。
        if (opts.projectId) {
          try {
            const project = await readProject(c, opts.projectId); // ownership 门
            const outputIds = await projectsService.listOutputIdsByProject(
              c,
              opts.projectId,
            );
            const merged = {
              plays: null as number | null,
              likes: null as number | null,
              comments: null as number | null,
              shares: null as number | null,
            };
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
                const m = await metricsOfPublication(pub.id);
                merged.plays = merged.plays ?? m.plays;
                merged.likes = merged.likes ?? m.likes;
                merged.comments = merged.comments ?? m.comments;
                merged.shares = merged.shares ?? m.shares;
              }
            }
            const hasAny =
              merged.plays !== null ||
              merged.likes !== null ||
              merged.comments !== null ||
              merged.shares !== null;
            return {
              subject: project.title,
              // [T-223] 单作品模式该行也带 projectId(前端/编导映射一致);externalId 从 platformRef 兜底。
              rows: hasAny
                ? [{ projectId: opts.projectId, title: project.title, ...merged }]
                : [],
              // 留存点无公开读 seam → 诚实空(不跨模块直连 repo、不编)。
              retention: [],
            };
          } catch {
            return { subject: null, rows: [], retention: [] };
          }
        }
        // 账号级模式:最近 N 发布作品,每作品一行(标题 + 该 publication 最新 snapshot 指标)。
        // [T-223] 每行 join 出 projectId + 真实 project.title —— 治「编导认不出作品」:原本只给
        //   revision 标题(imported publication 无 revision → 空 → 退到 platform="douyin" 匿名行),
        //   编导拿不到 projectId 无法读真逐字稿,只能瞎连/编造。现经 publication.contentOutputId →
        //   content_output(projectId) → project.title 补上锚点(project.title 是导入时落的真标题,
        //   reconstruct/复盘全档也在这条 project 上),让编导能把「最高播放」映射到具体作品读真稿。
        try {
          const pubs = await publishingService.getRecentPublicationsWithTitle(c, {
            limit: opts.limit,
            offset: 0,
          });
          // 同一 projectId 的真标题缓存(避免每行重复 get 项目)。
          const projectTitleCache = new Map<string, string>();
          const rows = await Promise.all(
            pubs.map(async (p) => {
              const m = await metricsOfPublication(p.id);
              let projectId: string | null = null;
              let projectTitle = "";
              try {
                // publication → content_output(带 projectId + output 标题,ownership 门)。
                const out = await readOutput(c, p.contentOutputId);
                projectId = out.projectId;
                if (projectTitleCache.has(projectId)) {
                  projectTitle = projectTitleCache.get(projectId) ?? "";
                } else {
                  try {
                    const proj = await readProject(c, projectId);
                    projectTitle = proj.title?.trim() ?? "";
                  } catch {
                    // 项目读不到(越权/已删)→ 退回 output 标题(仍比匿名平台名强)。
                    projectTitle = out.title?.trim() ?? "";
                  }
                  projectTitleCache.set(projectId, projectTitle);
                }
              } catch {
                // 解析不到作品映射 → projectId 留 null(诚实空,不硬造)。
                projectId = null;
              }
              return {
                projectId,
                externalId: p.externalId ?? null,
                // 真标题优先 project.title;回退 revision(p.title)→ 平台兜底(不再匿名化为 douyin)。
                title: projectTitle || p.title || p.platform || "（无标题发布）",
                ...m,
              };
            }),
          );
          return { subject: null, rows, retention: [] };
        } catch {
          return { subject: null, rows: [], retention: [] };
        }
      },
listLearnings: async (
        c: RequestContext,
        opts: {
          query?: string;
          learningType?: string;
          status?: string;
          limit: number;
        },
      ) => {
        try {
          const { rows } = await learningsService.listLearnings(c, {
            limit: 200,
            offset: 0,
          });
          const q = (opts.query ?? "").trim();
          const filtered = rows.filter((r) => {
            if (opts.learningType && r.learningType !== opts.learningType)
              return false;
            if (opts.status && r.validationStatus !== opts.status) return false;
            if (q && knowledgeRelevanceScore(`${r.title}\n${r.insight}`, q) === 0)
              return false;
            return true;
          });
          return {
            total: filtered.length,
            rows: filtered.slice(0, opts.limit).map((r) => ({
              id: r.id,
              title: r.title,
              insight: r.insight,
              learningType: r.learningType,
              status: r.validationStatus,
              reuseCount: r.reuseCount,
            })),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
listCandidates: async (
        c: RequestContext,
        opts: { limit: number; offset: number },
      ) => {
        try {
          const { rows, total } = await candidateService.listCandidates(c, {
            limit: opts.limit,
            offset: opts.offset,
          });
          return {
            total,
            rows: rows.map((r) => ({
              id: r.id,
              title: r.title,
              status: r.status,
              score: r.predictedScore,
              source: r.source,
            })),
          };
        } catch {
          return { rows: [], total: 0 };
        }
      },
getPredictions: async (c: RequestContext, opts: { limit: number }) => {
        let rubric: {
          name: string;
          versionNumber: number;
          dimensionCount: number;
        } | null = null;
        try {
          const version = await calibrationService.getCurrentRubricVersion(
            c,
            canonicalRubricIdFor(c), // [T-332 S2] per-account 默认 rubric
          );
          rubric = {
            name: "校准评分标准",
            versionNumber: version.versionNumber,
            dimensionCount: version.dimensions.length,
          };
        } catch {
          rubric = null; // 母版未建 / 读不到 → 诚实空(不编版本号)
        }
        try {
          const overview = await calibrationService.getOverview(c);
          const reflow = overview.reflowRows.slice(0, opts.limit);
          // 各对照行的作品标题 —— 从 pendingSubjects 按 subjectId 反查(overview 已含,不新读)。
          const titleBySubject = new Map(
            overview.pendingSubjects.map((s) => [s.subjectId, s.title]),
          );
          const rows = reflow.map((r) => {
            const hasResult = r.dimensions.some((d) => d.actual !== null);
            return {
              predictionId: r.predictionId,
              subjectTitle: titleBySubject.get(r.subjectId) ?? "",
              hasResult,
              deviationBand: r.deviationBand,
              finding: r.reason,
              dimensions: r.dimensions.map((d) => ({
                key: d.key,
                label: d.label,
                predicted: d.predicted,
                actual: d.actual,
                deviation: d.deviation,
              })),
            };
          });
          return { rubric, rows, total: overview.reflowRows.length };
        } catch {
          return { rubric, rows: [], total: 0 };
        }
      }
};
}
