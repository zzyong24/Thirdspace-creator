/**
 * 库 route([T-063a] IA 收敛底座 · 北极星 SPEC §1「库」新路由)。
 *
 * [T-063d] 深度融合:统一头部 = 三 tab 条 + 跨类搜索行(跳 /search)+ 统一倾倒场
 * (LibraryDumpZone,所有 tab 常驻;文件→素材流、文本→知识流、记经验→Copilot 深链)。
 * 三 tab 以 embedded 模式内嵌(去双头:知识 tab 收掉自己的 KnowledgeDumpZone、
 * 经验 tab 收掉页头;筛选/分页链接改指 /library?tab=,避免旧路由 301 丢 query)。
 *
 * `?tab=` 驱动三 tab,各 tab 内嵌现有 feature 页核心区与其 server 数据装配
 * (删壳不删肉,feature 组件零删除):
 *   - assets(默认):原 /assets 的 AssetsPage + buildAssetsViewModelReal
 *     (?type/?q/?page/?pageSize 原样生效);
 *   - knowledge:原 /knowledge 的 KnowledgePage + buildKnowledgeDashboardViewModel
 *     (?tag 原样生效);
 *   - experience:原 /experience 的 ExperiencePage + buildExperienceWorkspaceViewModel。
 *
 * 数据装配只在对应 tab 激活时读(tab 切换 = Link ?tab=,server 重渲)。页头「库」由
 * shell-router 提供;本页与原 /knowledge 一样走整页滚动(非 contentFill)。
 *
 * Session-scoped read(lane center-pages):有 session 构造 createServerClient(session.ctx)
 * 让读 user-scoped;无 session 走各 feature 的 singleton seam(SSR/测试不崩)。
 */

import { AssetsPage } from "@/features/assets/assets-page";
import type { AssetsDataClient } from "@/features/assets/assets-data";
import { buildAssetsViewModelReal } from "@/features/assets/assets-data";
import { KnowledgePage } from "@/features/knowledge/knowledge-page";
import type { KnowledgeDataClient } from "@/features/knowledge/knowledge-data";
import { buildKnowledgeDashboardViewModel } from "@/features/knowledge/knowledge-data";
import { ExperiencePage } from "@/features/experience/experience-page";
import type { ApplyTarget } from "@/features/experience/experience-page";
import {
  buildExperienceWorkspaceViewModel,
  type ExperienceDataClient,
} from "@/features/experience/experience-data";
import { LibraryDumpZone } from "@/features/library/library-dump-zone";
import { LibrarySearch } from "@/features/library/library-search";
import {
  LibraryTabBar,
  normalizeLibraryTab,
} from "@/features/library/library-tabs";
import {
  client as defaultClient,
  createServerClient,
} from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LibraryRoutePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const tab = normalizeLibraryTab(firstParam(params.tab));
  const session = await resolveSession();
  const client = session ? createServerClient(session.ctx) : undefined;

  return (
    <div data-page="library" className="flex flex-col gap-4">
      {/* [T-063d] 统一头部:三 tab 切换 + 跨类搜索(跳 /search,复用全局搜索的
          knowledge/asset facet)+ 统一倾倒场(所有 tab 常驻,倒任意东西自动分流)。 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LibraryTabBar active={tab} />
        <LibrarySearch />
      </div>
      <LibraryDumpZone />
      {tab === "knowledge" ? (
        <KnowledgeTab client={client} tag={firstParam(params.tag)} />
      ) : tab === "experience" ? (
        <ExperienceTab client={client} />
      ) : (
        <AssetsTab client={client} params={params} />
      )}
    </div>
  );
}

/** 素材 tab = 原 /assets 装配(tri-state:错误诚实、空态诚实,不编 fixture)。 */
async function AssetsTab({
  client,
  params,
}: {
  readonly client: ReturnType<typeof createServerClient> | undefined;
  readonly params: Record<string, string | string[] | undefined>;
}) {
  const search = {
    type: firstParam(params.type),
    q: firstParam(params.q),
    page: firstParam(params.page),
    pageSize: firstParam(params.pageSize),
  };
  if (!client) {
    return <AssetsPage {...search} embedded />;
  }
  const real = await buildAssetsViewModelReal(
    client as unknown as AssetsDataClient,
  );
  return (
    <AssetsPage
      {...search}
      viewModel={real.viewModel}
      projects={real.projects.map((p) => ({ id: p.id, title: p.title }))}
      state={real.state}
      error={real.error}
      embedded
    />
  );
}

/** 知识 tab = 原 /knowledge 装配(?tag 过滤原样生效,KNOW-13)。 */
async function KnowledgeTab({
  client,
  tag,
}: {
  readonly client: ReturnType<typeof createServerClient> | undefined;
  readonly tag: string | undefined;
}) {
  if (!client) {
    return <KnowledgePage embedded />;
  }
  const viewModel = await buildKnowledgeDashboardViewModel(
    client as unknown as KnowledgeDataClient,
    { tag: (tag ?? "").trim() || null },
  );
  return <KnowledgePage viewModel={viewModel} embedded />;
}

/** 经验 tab = 原 /experience 装配(裁决队列 + 应用目标候选)。 */
async function ExperienceTab({
  client,
}: {
  readonly client: ReturnType<typeof createServerClient> | undefined;
}) {
  const c = client ?? defaultClient;
  const [applyTargets, viewModel] = await Promise.all([
    resolveApplyTargets(c),
    buildExperienceWorkspaceViewModel(c as unknown as ExperienceDataClient),
  ]);
  return (
    <ExperiencePage viewModel={viewModel} applyTargets={applyTargets} embedded />
  );
}

interface ProjectListItemDto {
  readonly id: string;
  readonly title: string;
}

/** 「应用到项目」目标候选(与原 /experience route 同款;失败降级为空,控件隐藏)。 */
async function resolveApplyTargets(
  client: Pick<typeof defaultClient, "listProjects">,
): Promise<ReadonlyArray<ApplyTarget>> {
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 50 },
      body: undefined,
    })) as unknown as ReadonlyArray<ProjectListItemDto>;
    return projects.map((p) => ({ id: p.id, title: p.title }));
  } catch {
    return [];
  }
}
