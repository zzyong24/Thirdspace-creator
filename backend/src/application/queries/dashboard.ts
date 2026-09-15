import type { RequestContext, MetricCard, DashboardPage } from "@creatoros/contract";
import { createDashboardQueryService, composeDashboardTodos } from "../../modules/query-services";
type ProjectStageName=NonNullable<DashboardPage["continueCreating"]>["stage"];
type TaskStatus=DashboardPage["todos"][number]["status"];
export function createDashboardApplication(ports: {
projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>, "getDashboardSummary" | "listProjectsForComposition" | "listOutputRefsByProjects" | "hasImportedProjects" | "getOutput">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>, "listPublicationsByOutputIds" | "getRecentPublicationsWithTitle">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>, "getPublicationAnalytics" | "getDashboardRollup" | "getDailyPlayTrend">;
learningsService: Pick<ReturnType<typeof import("../../modules/learnings").createLearningsService>, "getSuggestions">;
executionService: Pick<ReturnType<typeof import("../../modules/execution").createExecutionService>, "list">;
candidateService: Pick<ReturnType<typeof import("../../modules/candidate").createCandidateService>, "listCandidates">;
platformAccountService: Pick<ReturnType<typeof import("../../modules/platform-account").createPlatformAccountService>, "listAccounts">;
contentCalendarService: Pick<ReturnType<typeof import("../../modules/content-calendar").createContentCalendarService>, "getCalendarRequestContext" | "listActiveProjectSchedules">;
notificationsServiceForQuery: Pick<ReturnType<typeof import("../../modules/notifications").createNotificationsService>, "getUnreadCount">;
resolveImportedPublicationIds: (ctx: RequestContext) => Promise<string[]>;
}) {
 const {projectsService,publishingService,analyticsService,learningsService,executionService,candidateService,platformAccountService,contentCalendarService,notificationsServiceForQuery}=ports;
 return { async getDashboard(ctx: RequestContext) {
  // 单次页面组合共享，不跨请求缓存；账号上下文始终使用本次调用。
  let importedIds: Promise<string[]> | undefined;
  const resolveImportedPublicationIds = (_ctx: RequestContext) =>
    importedIds ??= ports.resolveImportedPublicationIds(ctx);
  let importedState: Promise<boolean> | undefined;
  const hasImportedProjects = (_ctx: RequestContext) => importedState ??= projectsService.hasImportedProjects(ctx);
  const dashboardQuery = createDashboardQueryService({
    projects: {
      // GAP-DASH-1 做真:继续创作 = 用户最近活跃的非归档项目;待办 = 该项目下真实
      // 未完成 task。数据来自 projectsService.getDashboardSummary(本模块 repo 组合,
      // 不跨模块);facade 只补 heading + 收窄类型。
      getDashboardSummary: async (ctx) => {
        const summaryRead = projectsService.getDashboardSummary(ctx);
        const executionRead = executionService.list(ctx,{limit:30,offset:0}).catch(()=>({rows:[]}));
        const scheduleRead = ctx.accountId ? (async()=>{
          const [calendarContext,schedules,projects]=await Promise.all([
            contentCalendarService.getCalendarRequestContext(ctx),
            contentCalendarService.listActiveProjectSchedules(ctx,ctx.accountId!),
            projectsService.listProjectsForComposition(ctx),
          ]);
          const outputRefs=await projectsService.listOutputRefsByProjects(ctx,projects.map(p=>p.id));
          const publications=await publishingService.listPublicationsByOutputIds(ctx,outputRefs.map(o=>o.outputId));
          return {calendarContext,schedules,projects,outputRefs,publications};
        })().then(value=>({ok:true as const,value}),error=>({ok:false as const,error})) : null;
        const s = await summaryRead;
        const clampPriority = (p: number): 1 | 2 | 3 | 4 | 5 =>
          Math.min(5, Math.max(1, Math.round(p))) as 1 | 2 | 3 | 4 | 5;
        // [T-302] 派生待办:待确认渲染(exec.video.render 处 awaiting_confirmation → 采纳成片)。
        //   读时按当前状态算——采纳/丢弃后该任务离开 awaiting_confirmation → 待办自动消失,
        //   不依赖没人写的 stored task。派生项 completable=false(不给「完成」勾,状态驱动),
        //   href 直达制作视频页去采纳。读失败不崩看板。
        let derivedTodos: Array<{
          id: string;
          title: string;
          projectId: string;
          projectTitle: string;
          stage: ProjectStageName;
          dueAt: string | null;
          priority: 1 | 2 | 3 | 4 | 5;
          status: TaskStatus;
          href: string;
          completable: boolean;
          origin: "system_derived";
          reason: "video_render";
          plannedDate: null;
        }> = [];
        try {
          const { rows } = await executionRead;
          derivedTodos = rows
            .filter(
              (t) =>
                t.status === "awaiting_confirmation" &&
                t.execType === "video.render" &&
                typeof t.projectId === "string",
            )
            .slice(0, 3)
            .map((t) => ({
              id: t.id,
              title: "成片待采纳",
              projectId: t.projectId as string,
              projectTitle: "制作视频",
              stage: "production" as ProjectStageName,
              dueAt: null,
              priority: 2 as const,
              status: "todo" as TaskStatus,
              href: `/projects/${t.projectId}/production`,
              completable: false,
              origin: "system_derived" as const,
              reason: "video_render" as const,
              plannedDate: null,
            }));
        } catch {
          // 派生待办读失败 → 只出 stored 待办(通常也空),不崩看板。
        }
        const storedTodos = s.todos.map((t) => ({
          id: t.id,
          title: t.title,
          projectId: t.projectId,
          projectTitle: t.projectTitle,
          stage: t.stage as ProjectStageName,
          dueAt: t.dueAt,
          priority: clampPriority(t.priority),
          status: t.status as TaskStatus,
          href: null,
          completable: true,
          origin: "task" as const,
          reason: null,
          plannedDate: null,
        }));
        let scheduleReminderReadState:
          | { state: "ready"; error: null }
          | {
              state: "error";
              error: {
                code: "schedule_reminders_unavailable";
                message: string;
              };
            } = { state: "ready", error: null };
        let todos = composeDashboardTodos({
          today: "1970-01-01",
          schedules: [],
          projects: [],
          publishedProjectIds: new Set(),
          videoTodos: derivedTodos,
          storedTodos,
        });
        const scheduleAccountId = ctx.accountId;
        // 排期属于抖音账号维度。尚未绑定账号是正常上手状态，不应调用账号服务，更不能误报成
        // “排期暂不可用”。只有已绑定账号后的真实读取异常才进入可重试错误态。
        if (scheduleAccountId) {
          try {
            const result = await scheduleRead!;
            if(!result.ok) throw result.error;
            const {calendarContext,schedules,projects,outputRefs,publications}=result.value;
            const projectIdByOutput = new Map(
              outputRefs.map((output) => [
                output.outputId,
                output.projectId,
              ]),
            );
            const publishedProjectIds = new Set(
              publications
                .filter((publication) => publication.publishedAt !== null)
                .map((publication) =>
                  projectIdByOutput.get(publication.contentOutputId),
                )
                .filter((projectId): projectId is string => Boolean(projectId)),
            );
            const outputsByProject = new Map<
              string,
              Array<{ id: string; status: string }>
            >();
            for (const output of outputRefs) {
              const rows = outputsByProject.get(output.projectId) ?? [];
              rows.push({ id: output.outputId, status: output.status });
              outputsByProject.set(output.projectId, rows);
            }
            todos = composeDashboardTodos({
              today: calendarContext.today,
              schedules: schedules.map((entry) => ({
                id: entry.id,
                projectId: entry.projectId,
                plannedDate: entry.plannedDate,
              })),
              projects: projects.map((project) => ({
                id: project.id,
                title: project.title,
                status: project.status,
                source: project.source,
                currentStage: project.currentStage as ProjectStageName,
                updatedAt: project.updatedAt,
                outputs: outputsByProject.get(project.id) ?? [],
              })),
              publishedProjectIds,
              videoTodos: derivedTodos,
              storedTodos,
            });
          } catch (error) {
            console.error("[dashboard.schedule-reminders] 读取排期失败", {
              requestId: ctx.requestId,
              errorName: error instanceof Error ? error.name : "UnknownError",
              errorCode:
                error && typeof error === "object" && "code" in error
                  ? String(error.code)
                  : "unknown",
            });
            scheduleReminderReadState = {
              state: "error",
              error: {
                code: "schedule_reminders_unavailable",
                message: "排期提醒暂不可用，请重试",
              },
            };
          }
        }
        return {
          continueCreating: s.continueCreating
            ? {
                heading: "继续创作",
                projectId: s.continueCreating.projectId,
                projectTitle: s.continueCreating.projectTitle,
                stage: s.continueCreating.stage as ProjectStageName,
                progressPct: s.continueCreating.progressPct,
                updatedAt: s.continueCreating.updatedAt,
              }
            : null,
          todos,
          scheduleReminderReadState,
        };
      },
    },
    publishing: {
      getRecentPublications: async (ctx) => {
        // GAP-DASH-3 做真:真标题(来自 revision,publishing 模块内解析)+ 真播放/
        // 互动(facade 层 join analytics 最新快照 rawMetrics,跨模块组合只在此层)。
        // 数据底座(SPEC §1.4):有 imported 真项目 → 只取真实导入作品的发布(演示 fixture
        //   发布让位,治 dy-pub-00 假标题/0 播放);无 imported → 全量(过渡期演示态)。
        //   先多取一些再按 imported 集过滤,保证过滤后仍能凑满前 5 条真发布。
        const hasImported = await hasImportedProjects(ctx);
        const importedPubIds = hasImported
          ? new Set(await resolveImportedPublicationIds(ctx))
          : null;
        const fetched = await publishingService.getRecentPublicationsWithTitle(
          ctx,
          { limit: importedPubIds ? 100 : 5, ...(importedPubIds ? { publicationIds:[...importedPubIds] } : {}), displayLimit:5 },
        );
        const rows = (
          importedPubIds
            ? fetched.filter((r) => importedPubIds.has(r.id))
            : fetched
        ).slice(0, 5);
        const numOf = (raw: Record<string, unknown>, key: string): number => {
          const v = raw[key];
          return typeof v === "number" && Number.isFinite(v) ? v : 0;
        };
        return Promise.all(
          rows.map(async (r) => {
            let views = 0;
            let engagement = 0;
            try {
              const page = await analyticsService.getPublicationAnalytics(
                ctx,
                r.id,
                1,
                10,
              );
              const latest = page.rows
                .slice()
                .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
              const raw = (latest?.rawMetrics ?? {}) as Record<string, unknown>;
              // 数据底座(SPEC §1.4):播放量键名归一 —— 真采集(douyin ingestion)写
              //   `views`,演示 fixture 写 `plays`;优先真 `views`,缺失回退 `plays`(二者
              //   不并存)。否则真实导入作品的播放恒为 0(原只读 `plays`)。
              views = numOf(raw, "views") || numOf(raw, "plays");
              engagement =
                numOf(raw, "likes") +
                numOf(raw, "comments") +
                numOf(raw, "shares");
            } catch {
              // A single publication's analytics read failing degrades to 0 —
              // never crashes the whole dashboard composition.
            }
            // 数据底座(SPEC §1.4):imported publication 不带 revision(标题挂在
            //   content_output / project),故 revision 解析的 r.title 为空 → 回退到
            //   作品(content_output)的真实标题(治"未命名发布",出真实导入标题)。
            let title = r.title;
            if (!title) {
              try {
                const output = await projectsService.getOutput(ctx, r.contentOutputId);
                title = output.title;
              } catch {
                // 输出读失败(防御)→ 保持空,落到下方"未命名发布"兜底。
              }
            }
            return {
              id: r.id,
              title: title || "未命名发布",
              platform: r.platform as "youtube",
              status: r.status as "published",
              views,
              engagement,
              publishedAt: r.publishedAt ?? r.createdAt,
            };
          }),
        );
      },
    },
    analytics: {
      // GAP-DASH-2 做真:5 张指标卡(总播放/总点赞/新增粉丝/平均完播/总分享)+ 本周
      // 播放趋势,全来自 analyticsService.getDashboardRollup(本模块 user-scoped 聚合,
      // 每 publication 取最新快照)。无快照 → 空集(composer 判 empty),不造假。
      getDashboardMetrics: async (ctx) => {
        // 数据底座(SPEC §1.4):有 imported 真项目 → 指标卡/趋势只汇总真实导入作品的
        //   快照(演示 fixture 让位);无 imported → 全量 user-scoped(过渡期演示态)。
        const hasImported = await hasImportedProjects(ctx);
        const scope = hasImported ? {publicationIds:await resolveImportedPublicationIds(ctx)} : {};
        const [r,accountsResult,dailyResult]=await Promise.all([
          analyticsService.getDashboardRollup(ctx,scope),
          platformAccountService.listAccounts(ctx,{limit:100,offset:0}).catch(()=>null),
          analyticsService.getDailyPlayTrend(ctx,{...scope,days:7})
            .then(value=>({ok:true as const,value}),error=>({ok:false as const,error})),
        ]);
        if (r.snapshotCount === 0) return { metrics: [], trend: [] };
        const fmt = (v: number) =>
          v >= 10000
            ? `${(v / 10000).toFixed(1)} 万`
            : v.toLocaleString("zh-CN");
        const card = (
          id: string,
          label: string,
          value: string,
        ): MetricCard => ({
          id,
          label,
          value,
          delta: "",
          trend: "flat",
          tone: "positive",
        });
        // [T-071] 总粉丝(用户裁决:算不了增量就算总数)—— platform_accounts 基线求和,
        // 读失败诚实「—」。[Bug-2 T-015] 用户没手动设基线(baseline=0)时,**回退到 rollup
        // 的 followerGain**(采集期内粉丝增长,真值),label 跟着切到「新增粉丝(期内)」——不
        // 假装那是「总粉丝」。两者都没 → 「—」诚实空。
        let followerTotal: { label: string; value: string } = {
          label: "总粉丝",
          value: "—",
        };
        try {
          if(!accountsResult) throw new Error("accounts unavailable");
          const { rows: accounts } = accountsResult;
          // [T-074 用户裁决] 总粉丝只统计抖音(B站 8400 系 seed 幻觉数据已清,
          // 用户:「不要统计B站」);未来接别的平台前不并入总数。
          // [T-358] 账号隔离:只取**当前选中号**的基线——T-071 单号时代的「全号求和」在多号下
          // 变成跨号加总(真机实锤:两号 1103+2570=3673 同值串号,ISO-08 反例)。dashboard 其余
          // 指标走 per-account rollup 本就隔离,粉丝这条此前漏改。
          const baselineSum = accounts
            .filter(
              (a) =>
                a.status === "active" &&
                a.platform === "douyin" &&
                a.id === ctx.accountId,
            )
            .reduce((acc, a) => acc + (a.followerBaseline ?? 0), 0);
          if (baselineSum > 0) {
            followerTotal = { label: "总粉丝", value: fmt(baselineSum) };
          } else if (r.followerGain > 0) {
            // [Bug-2 T-015] 真值兜底:期内采集到的新增粉丝总和(label 显式标「期内」,别假装总数)。
            followerTotal = {
              label: "新增粉丝(期内)",
              value: fmt(r.followerGain),
            };
          }
        } catch {
          /* 显「—」 */
        }
        const metrics: MetricCard[] = [
          card("d-views", "总播放量", fmt(r.plays)),
          card("d-likes", "总点赞", fmt(r.likes)),
          // [Bug-2 T-015] label 随数据源动态切(基线 vs 期内增长 vs 诚实空)。
          card("d-followers", followerTotal.label, followerTotal.value),
          // [T-071] 完播率只在有明细快照(finish_rate 字段,拉明细采集产)时显真均值;
          // 没有 → 「—」,绝不显假 0.0%。
          {
            ...card(
              "d-finish",
              "平均完播率",
              r.finishCount > 0 ? `${r.finishAvg.toFixed(1)}%` : "—",
            ),
            tone: "info",
          },
          card("d-shares", "总分享", fmt(r.shares)),
        ];
        // [T-071] 本周趋势改真逐日:快照按日聚合差分(替换旧「总量按固定形状分摊」的
        // 假曲线)。有效点 < 2 天 → 空 trend(composer 显引导),不编形状。
        if(!dailyResult.ok) throw dailyResult.error;
        const daily=dailyResult.value;
        const trend =
          daily.length >= 2
            ? daily.map((d) => ({
                label: d.day.slice(5).replace("-", "/"),
                value: d.plays,
              }))
            : [];
        return { metrics, trend };
      },
    },
    learnings: {
      getSuggestions: async (ctx) => {
        const rows = await learningsService.getSuggestions(ctx, { limit: 3 });
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.recommendation ?? r.insight ?? "",
          category: r.learningType ?? "建议",
        }));
      },
    },
    notifications: {
      getUnreadCount: (ctx) => notificationsServiceForQuery.getUnreadCount(ctx),
    },
    knowledge: {
      // GAP-DASH-4 做真:热门选题 = 用户选题池(candidate)按预测分排序的前几条。
      // [T-049 B8] heat 直接用 predictedScore —— rubric 全链就是 0–100 分,旧代码误当
      // 0–1 再 ×100 → UI 显「热度 8800」;无分候选诚实置 0(不再编 50-i*5 假数)。
      // 读失败降级为空集,不崩面板。
      getTrendingTopics: async (ctx) => {
        try {
          const { rows } = await candidateService.listCandidates(ctx, {
            status: "pool",
            sort: "predictedScore",
            limit: 5,
            offset: 0,
          });
          return rows.map((c) => ({
            id: c.id,
            title: c.title,
            // [T-303] 热度优先预测分(每日出题落库);为空/0 时兜底 positioningFit(每候选都有的
            //   0–100 契合分)→ 存量/手动候选也有真热度,不再死列恒 0。都无 → 0(诚实)。
            heat:
              typeof c.predictedScore === "number" && c.predictedScore > 0
                ? Math.round(c.predictedScore)
                : typeof c.positioningFit === "number" && c.positioningFit > 0
                  ? Math.round(c.positioningFit)
                  : 0,
            trend: "up" as const,
          }));
        } catch {
          return [];
        }
      },
    },
  });

 return dashboardQuery.getDashboard(ctx);
 }};
}
