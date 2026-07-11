/**
 * 选题中心 page (选题中心大改 · Slice 2 三栏重构) — the 选题情报 surface.
 *
 * Layout (照目标设计):
 *   1. AI 选题会 带 (紫色 accent): 4 出题按钮 (基于定位/评论/知识库/热点) + 「当前依据」面板.
 *   2. 三栏 grid (左 选题来源 7 来源 · 中 选题候选池 富候选卡 · 右 选题卡详情).
 *   3. 选题流转漏斗: 6 态 (待收集/待评估/待补充/已立项/已丢弃/已发布回流).
 *
 * Server-component shell with a `viewModel?` test seam. The default render reads
 * `candidates.list` (sorted) + `topics.overview` (出题依据 + 7 来源 + 6 态漏斗, every count
 * DERIVED from real rows — composite transport → Drizzle/pglite, NOT fixtures-only). The
 * selection-driven three-column body (中候选池 ⇄ 右详情 共享 selected-candidate state) lives
 * in the client island `topics-interactive-region.tsx`; the AI 选题会 带 in
 * `topic-generate-island.tsx`. Mutations (新建/补全/立项/丢弃/采纳) → mapped contract op then
 * `router.refresh()`.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors. Empty
 * 选题卡 字段 are dropped (never invented); null 指标 render 「—」.
 */

import * as React from "react";
import {
  Inbox,
  ClipboardList,
  Sparkles,
  Rocket,
  Trash2,
  RefreshCw,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { client as defaultClient } from "@/lib/contract-client.server";
import { cn } from "@/lib/utils";
import type {
  CandidateResource,
  TopicsOverviewResource,
} from "@creatoros/backend/modules/candidate";
import type { BenchmarkSourceResource } from "@creatoros/backend/modules/benchmark";
import type { TrendSourceResource } from "@creatoros/backend/modules/trend-sources";

import {
  TopicsWorkspace,
  type CandidateSortKey,
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
  | "pendingTopicReview"
  // [T-216] 对标源登记面板的服务端读源(选题/对标强化 §2.1)。
  | "listBenchmarkSources"
  // [T-235e] 信号源弹窗 tab1(网页信源)读源。
  | "listTrendSources"
  // [T-235e] 供给链健康条:benchmark / topic.daily 作业 lastRunAt。
  | "listScheduledJobs"
  // [T-235e] 黑马关键词 tab(展示型 v1):定位 keywords。
  | "getPositioningCenter"
>;

export interface TopicsViewModel {
  readonly candidates: CandidateResource[];
  readonly overview: TopicsOverviewResource;
  readonly sort: CandidateSortKey;
  /** 最近一条待审阅的 topic.generate 任务(跨刷新缓存);无则 null。 */
  readonly pendingReview: null;
  /** [T-216] 已登记的对标源(对标源登记面板)。可选:测试/无源账号缺省空列表。 */
  readonly benchmarkSources?: BenchmarkSourceResource[];
  /** [T-235e] 已登记的网页信源(信号源弹窗 tab1)。可选:缺省空列表。 */
  readonly trendSources?: TrendSourceResource[];
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

export async function TopicsPage({
  viewModel,
  sort,
  client = defaultClient,
}: TopicsPageProps) {
  const activeSort = normalizeSort(sort);
  const vm = viewModel ?? (await loadViewModel(activeSort, client));
  return <TopicsView viewModel={vm} />;
}

async function loadViewModel(
  sort: CandidateSortKey,
  client: TopicsReadClient,
): Promise<TopicsViewModel> {
  const candidates = (await client.listCandidates({
    params: undefined,
    query: { page: 1, pageSize: 100, sort },
    body: undefined,
  })) as unknown as CandidateResource[];
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
  // [T-060①] TopicReviewDialog 弹窗任务流退役 —— pendingTopicReview 不再消费
  // (对话内 ChatCandidateCard 即出即采,没有「待审阅弹窗」概念)。
  return {
    candidates,
    overview,
    sort,
    pendingReview: null,
    benchmarkSources,
    trendSources,
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
    pendingReview,
    benchmarkSources = [],
    trendSources = [],
    supplyHealth,
    dayStartIso,
    darkhorseKeywords = [],
  } = viewModel;

  return (
    // 固定高度填满：页头 + AI 选题会带 + 漏斗 shrink-0 钉住,中间三栏 flex-1 占满剩余
    // 高度、每列框内独立滚动 (整页不再滚动)。
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

      {/* 1. AI 选题会 带 (钉住·固定高度,候选/步骤进弹窗) —— 4 依据按钮保留降级为「手动加餐」。 */}
      <div className="shrink-0">
        <TopicGenerateBand basis={overview.basis} pendingReview={pendingReview} />
      </div>

      {/* 2. 三栏：来源 / 候选池 / 详情 (flex-1 占满,每列各自框内滚) */}
      <TopicsWorkspace
        candidates={candidates}
        sources={overview.sources}
        sort={sort}
      />

      {/* 3. 选题流转漏斗 (钉住底部) */}
      <div className="shrink-0">
        <FunnelStrip funnel={overview.funnel} />
      </div>
    </div>
  );
}

// ── 选题流转漏斗 (6 态横向) ───────────────────────────────────────────────────────
const FUNNEL_ICONS: Record<string, LucideIcon> = {
  collecting: Inbox,
  evaluating: ClipboardList,
  enriching: Sparkles,
  promoted: Rocket,
  dropped: Trash2,
  recycled: RefreshCw,
};

function FunnelStrip({
  funnel,
}: {
  readonly funnel: TopicsOverviewResource["funnel"];
}) {
  return (
    <section
      data-testid="topics-funnel"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">选题流转漏斗</h3>
        <span className="text-xs text-text-subtle">全部流转</span>
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        {funnel.map((stage, i) => {
          const Icon = FUNNEL_ICONS[stage.key] ?? Inbox;
          const isTerminal = stage.key === "dropped";
          return (
            <React.Fragment key={stage.key}>
              <div
                data-testid="funnel-stage"
                data-stage={stage.key}
                className="flex min-w-[110px] flex-1 flex-col items-center gap-1.5 rounded-control border border-border bg-surface-subtle/50 px-3 py-3"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-control",
                    isTerminal
                      ? "bg-surface-subtle text-text-subtle"
                      : "bg-brand-soft text-brand",
                  )}
                >
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {stage.count}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {stage.label}
                </span>
              </div>
              {i < funnel.length - 1 ? (
                <span className="hidden items-center self-center text-text-subtle md:flex">
                  <ArrowRight className="size-4" />
                </span>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
