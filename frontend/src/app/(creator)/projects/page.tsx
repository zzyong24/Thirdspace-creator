/**
 * 作品 hub route([T-063a] IA 收敛底座 · 北极星 SPEC §1「作品」)。
 *
 * /projects 从「项目列表单页」变成作品全生命周期漏斗,`?tab=` 驱动四个 tab:
 *   - 候选 candidates:内嵌原 /topics 核心区(TopicGenerateBand + TopicsWorkspace +
 *     FunnelStrip,embedded 模式隐藏其自带页头);
 *   - 进行中 active(默认):现有项目列表(ProjectsPage,?page/?status/?sort 原样生效);
 *   - 已发布 published:内嵌原 /publishing 核心区(真发布行装配 buildPublishingCenterViewModelReal);
 *   - 排期 schedule:内嵌原 /calendar 核心区(ContentCalendarPage)。
 *
 * tab 切换 = Link ?tab=(server 重渲):数据装配只在对应 tab 激活时读,避免一页拉四页
 * 数据。旧路由 /topics /publishing /calendar 已 301 到对应 tab;feature 组件零删除
 * (删壳不删肉,深度融合在 T-063c)。
 *
 * Session-scoped read(lane center-pages):有 session 构造 createServerClient(session.ctx)
 * 让各 tab 的读 user-scoped;无 session 走各 feature 的 singleton seam(SSR/测试不崩)。
 */

import { ProjectsPage } from "@/features/projects/projects-page";
import {
  normalizeProjectsHubTab,
  ProjectsHubTabBar,
} from "@/features/projects/projects-hub-tabs";
import { TopicsPage } from "@/features/topics/topics-page";
import type { CandidateSortKey } from "@/features/topics/topics-interactive-region";
import { PublishingCenterPage } from "@/features/publishing-center/publishing-center-page";
import type { PublishingCenterDataClient } from "@/features/publishing-center/publishing-center-data";
import { buildPublishingCenterViewModelReal } from "@/features/publishing-center/publishing-center-data";
import { ContentCalendarPage } from "@/features/content-calendar/content-calendar-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const tab = normalizeProjectsHubTab(firstParam(params.tab));

  const session = await resolveSession();
  const client = session ? createServerClient(session.ctx) : undefined;

  return (
    <div data-page="projects-hub" className="flex flex-col gap-4">
      <ProjectsHubTabBar active={tab} />
      {tab === "candidates" ? (
        // 原 /topics 是 contentFill 路由(三栏各自框内滚);内嵌进整页滚动的作品页后,
        // 由这个定高容器给它可分配的高度,内部滚动行为原样保留。
        <div className="flex h-[calc(100vh-15rem)] min-h-[560px] flex-col">
          <TopicsPage
            embedded
            sort={firstParam(params.sort) as CandidateSortKey | undefined}
            {...(client ? { client } : {})}
          />
        </div>
      ) : tab === "published" ? (
        <PublishedTab
          client={client as unknown as PublishingCenterDataClient | undefined}
        />
      ) : tab === "schedule" ? (
        <ContentCalendarPage {...(client ? { client } : {})} />
      ) : (
        <ActiveTab params={params} client={client} />
      )}
    </div>
  );
}

/** 进行中 tab = 原项目列表(?page/?status/?sort 解析逻辑原样保留,[T-051 2b])。 */
async function ActiveTab({
  params,
  client,
}: {
  readonly params: Record<string, string | string[] | undefined>;
  readonly client: ReturnType<typeof createServerClient> | undefined;
}) {
  const raw = firstParam(params.page);
  const parsed = Number(raw);
  const page = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  const rawStatus = firstParam(params.status);
  const status = rawStatus && /^[a-z]+$/.test(rawStatus) ? rawStatus : "all";
  const rawSort = firstParam(params.sort);
  const sort =
    rawSort && ["updated", "progress", "stage", "title"].includes(rawSort)
      ? rawSort
      : "updated";
  return (
    <ProjectsPage
      page={page}
      status={status}
      sort={sort}
      {...(client ? { client } : {})}
    />
  );
}

/** 已发布 tab = 原发布中心读侧(真发布行装配;读失败在 helper 内降级,页面不抛)。 */
async function PublishedTab({
  client,
}: {
  readonly client: PublishingCenterDataClient | undefined;
}) {
  if (!client) {
    return <PublishingCenterPage />;
  }
  const viewModel = await buildPublishingCenterViewModelReal(client);
  return <PublishingCenterPage viewModel={viewModel} />;
}
