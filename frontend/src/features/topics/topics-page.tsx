/**
 * 选题中心 page (选题中心大改 · Slice 2 三栏重构) — the 选题情报 surface.
 *
 * Layout ([T-242] 候选池 C 位,漏斗移除 —— 用户拍板「最核心的应该是选题候选池」):
 *   1. 供给链健康条 + 今日新选题条带 (紧凑,shrink-0 钉住).
 *   2. AI 选题会 带 (一行紧凑排布,「手动加餐」定位): 4 出题按钮 + 内联「当前依据」.
 *   3. 三栏 grid (左 选题来源 · 中 选题候选池 · 右 选题卡详情) —— flex-1 占满剩余高度,
 *      是页面绝对主体 (视觉权重 ≥60% 屏).
 *   (原页尾 6 态流转漏斗已移除;`overview.funnel` 仍随复合读返回但不再渲染.)
 *
 * Server-component shell with a `viewModel?` test seam. The default render reads
 * `candidates.list` (sorted) + `topics.overview` (出题依据 + 7 来源, every count
 * DERIVED from real rows — composite transport → Drizzle/pglite, NOT fixtures-only). The
 * selection-driven three-column body (中候选池 ⇄ 右详情 共享 selected-candidate state) lives
 * in the client island `topics-interactive-region.tsx`; the AI 选题会 带 in
 * `topic-generate-island.tsx`. Mutations (新建/补全/立项/丢弃/采纳) → mapped contract op then
 * `router.refresh()`.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors. Empty
 * 选题卡 字段 are dropped (never invented); null 指标 render 「—」.
 */

import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  CandidateResource,
  TopicsOverviewResource,
} from "@creatoros/backend/modules/candidate";
import type { BenchmarkSourceResource } from "@creatoros/backend/modules/benchmark";
import type { TrendSourceResource } from "@creatoros/backend/modules/trend-sources";
// [T-235c] 指定收藏夹登记(信号源弹窗第 4 tab)。
import type { FavoritesFolderResource } from "@creatoros/backend/modules/favorites";

import {
  TopicsWorkspace,
  type CandidateSortKey,
  type CandidateSourceFilter,
} from "./topics-interactive-region";
import {
  TopicGenerateBand,
} from "./topic-generate-island";
// [T-235e] 被服务感知:今日新选题条带 + 供给链健康条 + 统一「信号源」弹窗(三 tab)。
import {
  TodayTopicsStrip,
  SupplyHealthStrip,
  SignalSourcesButton,
  type SupplyHealth,
} from "./topics-supply-region";

/**
 * Structural seam for the server reads. The route passes a session-scoped
 * `createServerClient(ctx)` so candidates / overview stay user-scoped; the default keeps
 * the singleton (canonical ctx) as the SSR/test fallback seam.
 */
export type TopicsReadClient = Pick<
  typeof defaultClient,
  | "listCandidates"
  | "overviewTopics"
  // [T-248 批C] pendingTopicReview 已随契约 op ai.tasks.pending_topic_review 删除(T-060 退役残留)。
  // [T-216] 对标源登记面板的服务端读源(选题/对标强化 §2.1)。
  | "listBenchmarkSources"
  // [T-235e] 信号源弹窗 tab1(网页信源)读源。
  | "listTrendSources"
  // [T-235c] 信号源弹窗 tab4(指定收藏夹)读源。
  | "listFavoritesFolders"
  // [T-235e] 供给链健康条:benchmark / topic.daily 作业 lastRunAt。
  | "listScheduledJobs"
  // [T-235e] 黑马关键词 tab(展示型 v1):定位 keywords。
  | "getPositioningCenter"
>;

export interface TopicsViewModel {
  /**
   * 全量候选(不带来源过滤)—— 今日条带 / 供给链健康条 / 来源行禁用判定都吃它,
   * 保证来源过滤只影响候选池、不影响页顶统计([T-244] 防回归)。
   */
  readonly candidates: CandidateResource[];
  readonly overview: TopicsOverviewResource;
  readonly sort: CandidateSortKey;
  /** [T-244] 当前来源过滤(`?source=`,白名单后);null/缺省 = 不过滤。 */
  readonly sourceFilter?: CandidateSourceFilter | null;
  /**
   * [T-244] 候选池实际渲染的列表:有来源过滤时 = 服务端 `candidates.list?source=` 的结果,
   * 无过滤时缺省 → 复用 `candidates`(老测试 VM 不用补字段)。
   */
  readonly poolCandidates?: CandidateResource[];
  /** 最近一条待审阅的 topic.generate 任务(跨刷新缓存);无则 null。 */
  readonly pendingReview: null;
  /** [T-216] 已登记的对标源(对标源登记面板)。可选:测试/无源账号缺省空列表。 */
  readonly benchmarkSources?: BenchmarkSourceResource[];
  /** [T-235e] 已登记的网页信源(信号源弹窗 tab1)。可选:缺省空列表。 */
  readonly trendSources?: TrendSourceResource[];
  /** [T-235c] 已登记的指定收藏夹(信号源弹窗 tab4)。可选:缺省空列表。 */
  readonly favoritesFolders?: FavoritesFolderResource[];
  /** [T-235e] 供给链健康条的调度实绩;读不到 → undefined → 各环节显「—」诚实降级。 */
  readonly supplyHealth?: SupplyHealth;
  /** [T-235e] 本地自然日起点 ISO(服务端算好传入,渲染无 Date.now);缺省 → 今日条带空态。 */
  readonly dayStartIso?: string;
  /** [T-235e] 黑马关键词(展示型 v1 = 定位 keywords)。可选:缺省空列表。 */
  readonly darkhorseKeywords?: string[];
}

export interface TopicsPageProps {
  /** Override hook for tests; defaults to the server reads. */
  readonly viewModel?: TopicsViewModel;
  /** The active sort, read from the search params (defaults to predictedScore). */
  readonly sort?: CandidateSortKey;
  /** [T-244] `?source=` 来源过滤(白名单 = candidateSource 枚举);非法值静默回全部。 */
  readonly source?: string;
  /**
   * Session-scoped contract client for the production read path. The route passes
   * `createServerClient(session.ctx)`; defaults to the singleton seam.
   */
  readonly client?: TopicsReadClient;
}

const SORT_KEYS: readonly CandidateSortKey[] = [
  "predictedScore",
  "positioningFit",
  "demandCount",
  // [T-216] 防茧房推荐排序:护栏注入后分 + 探索位。
  "guardrail",
];

function normalizeSort(sort: string | undefined): CandidateSortKey {
  return SORT_KEYS.includes(sort as CandidateSortKey)
    ? (sort as CandidateSortKey)
    : "predictedScore";
}

// [T-244] `?source=` 白名单 —— 契约 candidateSource 全枚举(contract/src/primitives.ts:126)。
// 照 SORT_KEYS 模式:非法/缺省值静默归一成「不过滤」,绝不把任意字符串透传给后端 query。
const SOURCE_FILTER_KEYS: readonly CandidateSourceFilter[] = [
  "trend",
  "benchmark",
  "demand",
  "idea",
  // [T-235c] 收藏夹跟拍候选(指定收藏夹采集进池)。
  "favorites",
];

function normalizeSourceFilter(
  source: string | undefined,
): CandidateSourceFilter | null {
  return SOURCE_FILTER_KEYS.includes(source as CandidateSourceFilter)
    ? (source as CandidateSourceFilter)
    : null;
}

export async function TopicsPage({
  viewModel,
  sort,
  source,
  client = defaultClient,
}: TopicsPageProps) {
  const activeSort = normalizeSort(sort);
  const activeSource = normalizeSourceFilter(source);
  const vm = viewModel ?? (await loadViewModel(activeSort, activeSource, client));
  return <TopicsView viewModel={vm} />;
}

async function loadViewModel(
  sort: CandidateSortKey,
  sourceFilter: CandidateSourceFilter | null,
  client: TopicsReadClient,
): Promise<TopicsViewModel> {
  const candidates = (await client.listCandidates({
    params: undefined,
    query: { page: 1, pageSize: 100, sort },
    body: undefined,
  })) as unknown as CandidateResource[];
  // [T-244] 来源过滤走服务端 `candidates.list?source=`(真 SQL 过滤,非前端糊)。
  // 全量 `candidates` 仍照常读:今日条带 / 健康条 / 来源行禁用判定不受过滤影响。
  let poolCandidates = candidates;
  if (sourceFilter) {
    poolCandidates = (await client.listCandidates({
      params: undefined,
      query: { page: 1, pageSize: 100, sort, source: sourceFilter },
      body: undefined,
    })) as unknown as CandidateResource[];
  }
  const overview = (await client.overviewTopics({
    params: undefined,
    query: undefined,
    body: undefined,
  })) as unknown as TopicsOverviewResource;
  // [T-216] 对标源列表(对标源登记面板)。契约 list envelope → data 数组。
  const benchmarkSources = (await client.listBenchmarkSources({
    params: undefined,
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown as BenchmarkSourceResource[];
  // [T-235e] 信号源 / 健康条 / 黑马关键词 —— 每路独立 try/catch:任一读挂了只降级该环节
  // (显「—」/ 空列表),不拖垮整页(诚实降级,不编数)。
  let trendSources: TrendSourceResource[] = [];
  try {
    trendSources = (await client.listTrendSources({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as TrendSourceResource[];
  } catch {
    trendSources = [];
  }
  // [T-235c] 指定收藏夹登记(信号源弹窗 tab4)—— 同款独立 try/catch 诚实降级。
  let favoritesFolders: FavoritesFolderResource[] = [];
  try {
    favoritesFolders = (await client.listFavoritesFolders({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as FavoritesFolderResource[];
  } catch {
    favoritesFolders = [];
  }
  let supplyHealth: SupplyHealth | undefined;
  try {
    const jobsRaw = (await client.listScheduledJobs({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as Array<{
      sourceKind: string;
      enabled: boolean;
      lastRunAt: string | null;
    }>;
    const jobs = Array.isArray(jobsRaw) ? jobsRaw : [];
    const lastRunOf = (kind: string): string | null =>
      jobs
        .filter((j) => j.sourceKind === kind && j.lastRunAt)
        .map((j) => j.lastRunAt as string)
        .sort()
        .at(-1) ?? null;
    supplyHealth = {
      benchmarkLastRunAt: lastRunOf("benchmark"),
      topicDailyLastRunAt: lastRunOf("topic.daily"),
    };
  } catch {
    supplyHealth = undefined; // 调度读不到 → 健康条时间环节显「—」
  }
  let darkhorseKeywords: string[] = [];
  try {
    const center = (await client.getPositioningCenter({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as unknown as { keywords?: string[] };
    darkhorseKeywords = center?.keywords ?? [];
  } catch {
    darkhorseKeywords = [];
  }
  // 本地自然日起点(服务端一次算好传入,保持渲染纯净 —— C-5 渲染内无 Date.now)。
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  // [T-060①] TopicReviewDialog 弹窗任务流退役(对话内 ChatCandidateCard 即出即采,
  // 没有「待审阅弹窗」概念);[T-248 批C] 契约 op ai.tasks.pending_topic_review 已删,
  // pendingReview 恒 null(仅为 TopicGenerateBand props 兼容保留)。
  return {
    candidates,
    overview,
    sort,
    sourceFilter,
    poolCandidates,
    pendingReview: null,
    benchmarkSources,
    trendSources,
    favoritesFolders,
    supplyHealth,
    dayStartIso: dayStart.toISOString(),
    darkhorseKeywords,
  };
}

// Pure render — split out so tests can drive it synchronously with a fixed VM.
export function TopicsView({
  viewModel,
}: {
  readonly viewModel: TopicsViewModel;
}) {
  const {
    candidates,
    overview,
    sort,
    sourceFilter = null,
    poolCandidates,
    pendingReview,
    benchmarkSources = [],
    trendSources = [],
    favoritesFolders = [],
    supplyHealth,
    dayStartIso,
    darkhorseKeywords = [],
  } = viewModel;

  return (
    // [T-242] 固定高度填满：页头 + 健康条 + 今日条带 + AI 选题会带(一行紧凑) shrink-0
    // 钉住,候选池三栏 flex-1 占满全部剩余高度 (页面主体)、每列框内独立滚动。
    <div
      data-slot="topics"
      data-testid="topics"
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <header className="flex shrink-0 items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">选题中心</h1>
          <p className="text-sm text-muted-foreground">
            从真实信号出题、补全选题卡、择优立项——一条选题从灵感到立项的全流程。
          </p>
        </div>
        {/* [T-235e] 统一「信号源」入口(网页信源 / 对标博主 / 黑马关键词 三 tab),
            替换原「对标源」按钮 —— 心智=「我的选题信号源」。 */}
        <SignalSourcesButton
          benchmarkSources={benchmarkSources}
          trendSources={trendSources}
          favoritesFolders={favoritesFolders}
          darkhorseKeywords={darkhorseKeywords}
        />
      </header>

      {/* [T-235e·②] 供给链健康条:灰色细条一行,对标采集→拆解→黑马→出题→待审,点击跳 /automations。 */}
      <SupplyHealthStrip
        health={supplyHealth}
        candidates={candidates}
        dayStartIso={dayStartIso}
      />

      {/* [T-235e·①] 今日新选题:页顶横向滚动卡片带(来源徽标 + 一句依据;空态诚实)。 */}
      <TodayTopicsStrip candidates={candidates} dayStartIso={dayStartIso} />

      {/* [T-242] AI 选题会 带 (一行紧凑排布 ——「手动加餐」定位,不与候选池抢视觉权重)。 */}
      <div className="shrink-0">
        <TopicGenerateBand basis={overview.basis} pendingReview={pendingReview} />
      </div>

      {/* [T-242] 候选池三栏 C 位：来源 / 候选池 / 详情 —— flex-1 占满全部剩余高度,
          页面主体 (原页尾 6 态漏斗已移除,高度全部让给候选池)。 */}
      {/* [T-244] 候选池吃过滤后的 poolCandidates;禁用判定吃全量 candidates(来源行是否可点
          取决于「有没有该来源的候选可看」,不随当前过滤态变化)。 */}
      <TopicsWorkspace
        candidates={poolCandidates ?? candidates}
        allCandidates={candidates}
        sources={overview.sources}
        sort={sort}
        sourceFilter={sourceFilter}
      />
    </div>
  );
}
