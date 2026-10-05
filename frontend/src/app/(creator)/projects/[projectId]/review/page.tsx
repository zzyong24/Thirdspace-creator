/**
 * Analytics & Review route (Task 18 / module 11 Task 5).
 *
 * `/projects/[projectId]/review` renders the project-workspace Header
 * mode page for the Review stage (page-specs §10). The route lives
 * inside the `(creator)` segment so the shared AppShell (one Sidebar
 * + one TopHeader in `project-workspace` mode, with the Review stage
 * active) wraps it; the page itself is a Server Component.
 *
 * Module 11 server read switch: the route fetches the REAL op
 * `analytics.projects.get` (user-scoped pglite) and builds the page
 * ViewModel from the returned `MetricSnapshot[]`. The per-tab window
 * re-derivation stays a pure client selector over the already-fetched
 * data (no new fetch per tab). A resolution failure degrades to the
 * deterministic fixture default so the page never crashes.
 *
 * 工作台读侧做真: the ViewModel is now assembled by
 * `buildReviewWorkspaceViewModel`, which keeps the (mock) metrics/chart base
 * from the analytics op AND overlays the REAL AI 洞察/经验 region from
 * `learnings.list` (the AI-distilled experience persisted by the 复盘 pipeline).
 * See `review-workspace-data.ts` for the real/mock split + degradation contract.
 */

import { AnalyticsReviewPage } from "@/features/review/analytics-review-page";
import {
  buildPredictionComparison,
  buildReviewWorkspaceViewModel,
  type PredictionComparisonClient,
  type ReviewDataClient,
} from "@/features/review/review-workspace-data";
import { isOwnershipError } from "@/features/project-overview/project-overview-workspace-data";
import { CrossAccountEmptyState } from "@/components/state/page-state";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import {GroupWorkspaceFilters} from '@/features/group-workspace/group-workspace-filters';
import {workspaceQueryFromSearch,platformName} from '@/features/group-workspace/workspace-query';
import {GroupProjectEvidence,projectEvidence} from '@/features/review/group-project-evidence';
import {ErrorState} from '@/components/state/page-state';

interface AnalyticsReviewRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
  readonly searchParams?: Promise<Record<string,string|string[]|undefined>>;
}

// Minimal client shape `resolveProjectIdParam` needs (projects.list) — narrower
// than ReviewDataClient, which has no listProjects op. [T-373] getProject 是
// 跨号整页门的所有权探针(OwnershipError → 整页诚实引导)。
interface ProjectListClient {
  listProjects(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getProject(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

export default async function AnalyticsReviewRoute({
  params,
  searchParams,
}: AnalyticsReviewRouteProps) {
  const { projectId } = await params;
  // Session → ctx (layout already guarded). No session → fixture-deriving page.
  const session = await resolveSession();
  if (!session) {
    return <AnalyticsReviewPage projectId={projectId} />;
  }
  // User-scoped read: an empty account reads empty, not the canonical seed.
  const scoped = createServerClient(session.ctx);
  const resolvedId = await resolveProjectIdParam(
    scoped as unknown as ProjectListClient,
    projectId,
  );
  // [T-373] 跨号整页门:项目按当前号读不到(OwnershipError,跨号/未知同貌,不泄露
  // 存在性)→ 整页诚实引导,与稿面根路由(page.tsx T-332 S4)同款语义。此前本页
  // 逐区 catch 成「诚实空」,跨号项目被隔离挡了读却照渲页面壳 → 半渲染。
  // 其他读失败(transport 等)维持原逐区降级路径,不新增 404。
  try {
    await (scoped as unknown as ProjectListClient).getProject({
      params: { projectId: resolvedId },
      query: undefined,
      body: undefined,
    });
  } catch (err) {
    if (isOwnershipError(err)) {
      return (
        <main
          data-app="creatoros"
          data-page="project-cross-account-404"
          className="flex flex-col gap-card-gap"
        >
          <CrossAccountEmptyState
            groupId={session.ctx.groupId}
            entityLabel="项目"
            backHref="/projects"
            backLabel="回项目列表"
          />
        </main>
      );
    }
  }
  const viewModel = await buildReviewWorkspaceViewModel(
    resolvedId,
    scoped as unknown as ReviewDataClient,
  );
  // [T-063e] 预测 vs 实际 对照(校准飞轮对照步并入复盘;null = 本项目未做盲预测)。
  const filters=workspaceQueryFromSearch(searchParams?await searchParams:{});
  let groupFilters:React.ReactNode, metricsContent:React.ReactNode, analysisScope:string|undefined;
  let publicationIds:readonly string[]|undefined;
  if(session.ctx.groupId){
    try{
      const groupData=await scoped.getGroupOverview({params:{groupId:session.ctx.groupId},query:filters,body:undefined});
      const workspace=groupData.workspace;
      groupFilters=<GroupWorkspaceFilters workspace={workspace}/>;
      const report=projectEvidence(await scoped.getDailyReport({params:undefined,query:{...filters,startDate:workspace.startDate,endDate:workspace.endDate},body:undefined}),resolvedId);
      publicationIds=report.works.map(w=>w.publicationId);
      const accountNames=Object.fromEntries(workspace.accounts.map(a=>[a.id,a.name]));
      metricsContent=<GroupProjectEvidence report={report} accountNames={accountNames}/>;
      analysisScope=`账号组 ${workspace.groupName}（${workspace.groupId}），${workspace.platform?platformName(workspace.platform):'全部平台'}，账号 ${workspace.accountId?accountNames[workspace.accountId]??workspace.accountId:'全部'}；${workspace.startDate}—${workspace.endDate}期间发布版本截至采集时的累计表现；publicationId: ${publicationIds.join(', ')||'无发布事实'}`;
    }catch{
      publicationIds=[];
      metricsContent=<ErrorState error={{code:'group_review_unavailable',message:'所选平台复盘数据暂时不可用，请重新读取。手动复盘记录仍可使用。'}}/>;
      analysisScope='所选平台数据读取失败，没有可核验的发布后证据；仅诊断当前稿件，不作效果归因';
    }
  }
  const predictionComparison = await buildPredictionComparison(
    resolvedId,
    scoped as unknown as PredictionComparisonClient,
    publicationIds?{publicationIds}:undefined,
  );
  // Module 13 Step 5 — supply the Reviews wiring so the authoring panel + history
  // drill call the real ops (reviews.create/insights.create/complete/get) over the
  // dispatch route, then router.refresh().
  return (
    <AnalyticsReviewPage
      projectId={resolvedId}
      viewModel={viewModel}
      reviewsWiring={{ projectId: resolvedId }}
      predictionComparison={predictionComparison}
      groupFilters={groupFilters}
      metricsContent={metricsContent}
      analysisScope={analysisScope}
      publicationIds={publicationIds}
    />
  );
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id against the
 * REAL persisted project list (`projects.list`). Mirrors the
 * publishing/production routes so a slug like `ai-native-browser` collapses to
 * the canonical `project-ainativebrowser` (matched on the kebab-cased project
 * title) before the feature renders. If no project matches (or the read fails),
 * the original param is passed through so the page surfaces its empty state
 * instead of crashing.
 */
async function resolveProjectIdParam(
  client: ProjectListClient,
  param: string,
): Promise<string> {
  if (!param) return param;
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; title: string }>;
    if (projects.some((project) => project.id === param)) {
      return param;
    }
    const slug = param.toLowerCase();
    const match = projects.find(
      (project) => slugifyTitle(project.title) === slug,
    );
    return match?.id ?? param;
  } catch {
    return param;
  }
}

function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
