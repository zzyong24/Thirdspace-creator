/**
 * Dashboard page (Task 9 / page-specs §1).
 *
 * Composes the 5-metric summary and the 3×2 dashboard grid inside the
 * page-scroll area. Data flows from `buildDashboardViewModel()`; the
 * page is otherwise a deterministic composition of approved shared
 * components.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group. The page just provides the content
 * slot.
 *
 * Layout invariants (locked by the page spec):
 *  - one row of five MetricCard,
 *  - three-column grid with six SectionCard in fixed order:
 *    Continue, Todo, Trending, Publications, Data, Suggestions,
 *  - the "新项目" entry is a Link to `/projects/new` so the
 *    intercepting modal from Task 8 is opened when navigated to.
 */

import * as React from "react";
import { STAGE_LABELS as CANONICAL_STAGE_LABELS } from "@/lib/stage-labels";
import Link from "next/link";

import { SectionCard } from "@/components/project/section-card";
import { MetricCard } from "@/components/project/metric-card";
import { StatusBadge } from "@/components/project/status-badge";
import { ProgressBar } from "@/components/project/progress-bar";
import { TagChip } from "@/components/content/tag-chip";
import { ChartFrame } from "@/components/analytics/chart-frame";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { projectWorkspaceHref } from "@/features/projects/project-href";
import { OnboardingCard } from "@/features/onboarding/onboarding-card";
// [T-247] 待办卡 client 岛(完成勾选 → tasks.patch)。
import { TodoCard } from "./todo-card";
import { client } from "@/lib/contract-client.server";
import {
  canonicalDataset,
  getProjectPlatforms,
} from "@/fixtures/canonical";
import { cn } from "@/lib/utils";
import type {
  ContinueCreating,
  DashboardViewModel,
  TopicRow,
  PublicationCompactRow,
  CreationSuggestion,
} from "@/types/view-models";
import type { ProjectStageName } from "@/types/domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DashboardPageProps {
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: DashboardViewModel;
  /**
   * The displayed greeting name. In production `(creator)/page.tsx` passes the
   * REAL account holder (`resolveSession().user.displayName` — identity
   * getCurrentUser, the same source the Shell user card reads). Only when there
   * is no session (SSR fallback / unit tests) is this omitted and the greeting
   * falls back to the fixture dataset so SSR never crashes. Also the test seam.
   */
  readonly greetingName?: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function DashboardPage({
  viewModel,
  greetingName,
}: DashboardPageProps = {}) {
  const vm =
    viewModel ??
    (await client.getDashboard({
      params: undefined,
      query: undefined,
      body: undefined,
    }));
  // Greet the real account holder: `page.tsx` passes the session user's
  // displayName via `greetingName`. Only the no-session SSR fallback / unit
  // tests reach the fixture default (so SSR never crashes).
  const greeting = buildGreeting(
    vm,
    greetingName ?? canonicalDataset.user.displayName,
  );
  return (
    <main
      data-app="creatoros"
      data-page="dashboard"
      className="flex flex-col gap-section-gap"
    >
      {/* [T-132] 常驻新手清单:Dashboard 主内容最顶部。client 组件,自己拉 state /
          判显隐(未完成且未「不再显示」才渲),配全或点「不再显示」后自动消失。 */}
      <OnboardingCard />

      <header className="flex flex-col gap-0.5">
        <h1
          data-slot="dashboard-welcome"
          className="font-heading text-xl font-semibold text-foreground"
        >
          {greeting}
        </h1>
        <p
          data-slot="dashboard-subtext"
          className="text-sm text-muted-foreground"
        >
          {buildDashboardSubtext(vm.todos.length, vm.suggestions.length)}
        </p>
      </header>


      <SummaryMetrics metrics={vm.metrics} />
      <DashboardGrid vm={vm} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Summary metrics
// ---------------------------------------------------------------------------

function SummaryMetrics({ metrics }: { metrics: DashboardViewModel["metrics"] }) {
  return (
    <section
      data-slot="dashboard-summary-metrics"
      aria-label="总览指标"
      className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-5"
    >
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          id={metric.id}
          label={metric.label}
          value={metric.value}
          delta={metric.delta}
          trend={metric.trend}
          tone={metric.tone}
        />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

function DashboardGrid({ vm }: { vm: DashboardViewModel }) {
  return (
    <section
      data-slot="dashboard-grid"
      aria-label="工作台"
      className="grid grid-cols-1 gap-card-gap md:grid-cols-2 lg:grid-cols-3"
    >
      <ContinueCreatingCard
        continueCreating={vm.continueCreating}
        projectPlatforms={
          vm.continueCreating
            ? getProjectPlatformLabels(vm.continueCreating.projectId)
            : []
        }
      />
      <TodoCard
        todos={vm.todos}
        scheduleReminderReadState={vm.scheduleReminderReadState}
      />
      <TrendingTopicsCard topics={vm.trendingTopics} />
      <RecentPublicationsCard publications={vm.recentPublications} />
      <DataOverviewCard vm={vm} />
      <CreationSuggestionsCard
        suggestions={vm.suggestions}
        continueCreating={vm.continueCreating}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// 继续创作
// ---------------------------------------------------------------------------

function ContinueCreatingCard({
  continueCreating,
  projectPlatforms,
}: {
  continueCreating: ContinueCreating | null;
  projectPlatforms: ReadonlyArray<string>;
}) {
  // T-143 ③:没有进行中项目(全新用户/清库)→ 诚实空态,不摆演示假项目。
  if (!continueCreating) {
    return (
      <div data-slot="continue-creating-card">
        <SectionCard title="继续创作" description="最近编辑的项目与下一步行动">
          <div
            data-slot="continue-creating-empty"
            className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border bg-surface-subtle px-3.5 py-6"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                还没有进行中的项目
              </p>
              <p className="text-xs text-muted-foreground">
                创建第一个项目,把选题变成可执行的创作流程。
              </p>
              {/* [T-332 S4·§6.2] 新号从零开始的引导:先定位(账号的创作方向是一切上游),
                  数据面等首轮采集(绑号 bootstrap 自动建的任务)跑完自然充实,诚实告知。 */}
              <p
                data-slot="dashboard-empty-bootstrap-hint"
                className="text-xs text-muted-foreground"
              >
                新账号建议先
                <Link
                  href="/positioning"
                  data-slot="dashboard-empty-positioning-link"
                  className="mx-0.5 font-medium text-brand underline-offset-4 hover:underline"
                >
                  完成这个号的定位
                </Link>
                ;数据类卡片会在首轮采集任务跑完后自动充实。
              </p>
            </div>
            <Link
              href="/projects/new"
              data-slot="new-project-entry"
              className={cn(
                "flex h-10 items-center justify-center gap-2 rounded-card bg-brand px-4 text-sm font-medium text-brand-foreground",
                "transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span aria-hidden="true">＋</span>
              <span>创建第一个项目</span>
            </Link>
          </div>
        </SectionCard>
      </div>
    );
  }

  // Deep-link the project row to its workspace (D3)。[T-076] 两阶段化:统一走
  // projectWorkspaceHref(review → 复盘页,其余 → 稿面),不再拼阶段子路由。
  const projectHref = projectWorkspaceHref(
    continueCreating.projectId,
    continueCreating.stage,
  );
  return (
    <div data-slot="continue-creating-card">
    <SectionCard
      title="继续创作"
      description="最近编辑的项目与下一步行动"
    >
      <div className="flex flex-col gap-3">
        <Link
          href={projectHref}
          data-slot="continue-creating-row"
          className="flex flex-col gap-2 rounded-card border border-border bg-surface-subtle p-3 transition-colors hover:border-brand/40 hover:bg-brand-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {continueCreating.projectTitle}
            </span>
            <StatusBadge status="active" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {projectPlatforms.length > 0 ? (
              projectPlatforms.map((platform) => (
                <TagChip key={platform} label={platform} tone="brand" size="sm" />
              ))
            ) : (
              // [FE-M04] 缺平台值显示「未设置」中性标签,不伪造「多平台」。
              <TagChip label="未设置" tone="neutral" size="sm" />
            )}
            <TagChip label={stageLabel(continueCreating.stage)} tone="info" size="sm" />
          </div>
          <ProgressBar
            value={continueCreating.progressPct}
            tone="brand"
            showValue
            label="项目进度"
          />
        </Link>
        <Link
          href="/projects/new"
          data-slot="new-project-entry"
          className={cn(
            "flex h-12 items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface-subtle text-sm font-medium text-brand",
            "transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span aria-hidden="true">＋</span>
          <span>新项目</span>
        </Link>
      </div>
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 待办事项
// ---------------------------------------------------------------------------

// [T-247] TodoCard 抽为 client 岛(./todo-card):每行加「完成」勾选 → tasks.patch
// { status: 'done' } → router.refresh(),读侧只回未完成任务,数字真的能减。

// ---------------------------------------------------------------------------
// 热门选题
// ---------------------------------------------------------------------------

function TrendingTopicsCard({ topics }: { topics: ReadonlyArray<TopicRow> }) {
  return (
    <div data-slot="trending-topics-card">
    <SectionCard
      title="热门选题"
      description="来自知识库的灵感与热点"
      action={
        <Link
          href="/topics"
          data-slot="trending-topics-action"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>去选题池</span>
          <span aria-hidden="true">→</span>
        </Link>
      }
    >
      {topics.length === 0 ? (
        // [T-197] 诚实空态(原来空数组渲空 ul = 一片空白像坏了)。
        <p
          data-slot="trending-topics-empty"
          className="rounded-control border border-dashed border-border bg-surface-subtle px-3 py-6 text-center text-xs text-muted-foreground"
        >
          还没有热门选题。去选题池让 AI 结合你的定位与知识库生成一批。
        </p>
      ) : (
      <ul
        data-slot="trending-topics"
        className="flex flex-col gap-2"
        aria-label="热门选题"
      >
        {topics.map((topic, index) => (
          <li
            key={topic.id}
            data-slot="trending-topic-row"
            data-trend={topic.trend}
            className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand"
              >
                {index + 1}
              </span>
              <span className="truncate text-sm text-foreground">
                {topic.title}
              </span>
            </div>
            <TagChip
              label={`热度 ${topic.heat}`}
              tone={topic.trend === "up" ? "warning" : "neutral"}
              size="sm"
            />
          </li>
        ))}
      </ul>
      )}
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 最近发布
// ---------------------------------------------------------------------------

function RecentPublicationsCard({
  publications,
}: {
  publications: ReadonlyArray<PublicationCompactRow>;
}) {
  return (
    <div data-slot="recent-publications-card">
    <SectionCard title="最近发布" description="各平台的最新表现">
      <ul
        data-slot="recent-publications"
        className="flex flex-col gap-2"
        aria-label="最近发布"
      >
        {publications.slice(0, 4).map((row) => (
          <li key={row.id} data-slot="publication-row">
            {/* D3: 最近发布 rows deep-link to the Publishing Center (the lean
                dashboard publication row carries no projectId, so /publishing is
                the cleanest real target). */}
            <Link
              href="/publishing"
              className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 py-2 transition-colors hover:border-brand/40 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex min-w-0 items-center gap-2">
                <PlatformIcon platform={row.platform} size="xs" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {row.title}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {row.views === null ? "尚未采集" : `${row.views.toLocaleString()} ${row.platform === "wechatOfficial" ? "次阅读" : "次播放"}`}
                  </span>
                </div>
              </div>
              <StatusBadge status={row.status} />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 数据概览
// ---------------------------------------------------------------------------

function DataOverviewCard({ vm }: { vm: DashboardViewModel }) {
  return (
    <div data-slot="data-overview-card">
    <SectionCard
      title="数据概览"
      description="本周累计播放与转化趋势"
      className="md:col-span-2 lg:col-span-1"
    >
      {/* [T-054] 删重复 KPI 瓷砖:同 5 个指标顶部一排已展示,本区再铺一遍是
          信息冗余(审计「怪」感来源之一)。数据概览聚焦趋势图。 */}
      {vm.dataOverview.trend.length === 0 ? (
        // [T-197] 无日序数据时显诚实说明,别显「最高0最低0」空图(误导成 0 播放;
        //   实际是单点快照没跨天日序)。需连续多日采集才有本周趋势。
        <p
          data-slot="data-overview-empty"
          className="mt-1 rounded-control border border-dashed border-border bg-surface-subtle px-3 py-6 text-center text-xs text-muted-foreground"
        >
          本周还没有足够的播放数据画趋势。多发几天、系统持续更新后,这里会出现走势图。
        </p>
      ) : (
      <div className="mt-1">
        <ChartFrame
          title="本周播放趋势"
          summary={buildTrendSummary(vm.dataOverview.trend)}
          trend={vm.dataOverview.trend}
          testId="dashboard-data-trend"
        />
      </div>
      )}
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 创作建议
// ---------------------------------------------------------------------------

function CreationSuggestionsCard({
  suggestions,
  continueCreating,
}: {
  suggestions: ReadonlyArray<CreationSuggestion>;
  continueCreating: ContinueCreating | null;
}) {
  return (
    <div data-slot="creation-suggestions-card">
    <SectionCard
      title="创作建议"
      description="基于当前进度的下一步行动"
    >
      {suggestions.length === 0 ? (
        // [T-197] 诚实空态(原来空数组渲空 ul 一片空白)。
        <p
          data-slot="creation-suggestions-empty"
          className="rounded-control border border-dashed border-border bg-surface-subtle px-3 py-6 text-center text-xs text-muted-foreground"
        >
          暂无创作建议。开始一个项目、发布作品后,这里会基于你的进度给下一步行动。
        </p>
      ) : (
      <ul
        data-slot="creation-suggestions"
        className="flex flex-col gap-2"
        aria-label="创作建议"
      >
        {suggestions.map((suggestion) => (
          <li
            key={suggestion.id}
            data-slot="suggestion-row"
            data-category={suggestion.category}
            className="flex flex-col gap-1 rounded-card border border-border bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                {suggestion.title}
              </span>
              <TagChip
                label={categoryLabel(suggestion.category)}
                tone="info"
                size="sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {suggestion.description}
            </p>
            {(() => {
              // D3: each suggestion routes to the most relevant real surface
              // for its category — there is no per-suggestion projectId, so the
              // target is resolved from the category + the active project.
              const cta = suggestionCta(suggestion.category, continueCreating);
              return (
                <Link
                  href={cta.href}
                  data-slot="suggestion-cta"
                  className="mt-0.5 inline-flex items-center gap-1 self-start text-xs font-medium text-brand underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{cta.label}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              );
            })()}
          </li>
        ))}
      </ul>
      )}
    </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// [T-247] todoHref / priorityLabel / priorityTone 随 TodoCard 迁至 ./todo-card。

/**
 * Category-aware CTA for a creation suggestion. 选题/研究/策划 category routes to
 * the topic pool; review resumes the active project's 复盘页; other stage
 * categories resume its 稿面 ([T-076] production 工作台已删,深链一律落稿面);
 * anything else falls back to starting a new project.
 */
function suggestionCta(
  category: string,
  continueCreating: ContinueCreating | null,
): { href: string; label: string } {
  if (category === "research" || category === "topic" || category === "planning") {
    return { href: "/topics", label: "去选题池" };
  }
  // T-143 ③:review/script/production/publishing 需要一个活跃项目;没有进行中项目时
  // 无从「继续」某个项目,回退到新建项目入口(诚实,不深链到不存在的 projectId)。
  if (continueCreating) {
    if (category === "review") {
      return {
        href: `/projects/${continueCreating.projectId}/review`,
        label: "立即创作",
      };
    }
    if (
      category === "script" ||
      category === "production" ||
      category === "publishing"
    ) {
      return {
        href: `/projects/${continueCreating.projectId}`,
        label: "立即创作",
      };
    }
  }
  return { href: "/projects/new", label: "立即创作" };
}

// [T-052] 阶段名迁单一词表(lib/stage-labels);recording/editing/ready 是
// dashboard 特有的任务态扩展键,保留在本地扩展。
const STAGE_LABELS: Record<ProjectStageName | string, string> = {
  ...CANONICAL_STAGE_LABELS,
  recording: "录制",
  editing: "剪辑",
  ready: "已就绪",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}


const CATEGORY_LABELS: Record<string, string> = {
  script: "脚本",
  production: "拍摄",
  publishing: "发布",
  research: "研究",
  planning: "策划",
  review: "复盘",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function getProjectPlatformLabels(projectId: string): ReadonlyArray<string> {
  // [FE-M04] 只返回真实目标平台;缺失就返回空(不再伪造「多平台」)。空数组时由
  // ContinueCreatingCard 显示「未设置」中性标签,诚实反映「还没配发布平台」。
  return getProjectPlatforms(projectId);
}

function buildTrendSummary(
  trend: ReadonlyArray<{ label: string; value: number }>,
): string {
  if (trend.length === 0) {
    return "本周暂无播放数据。";
  }
  const values = trend.map((point) => point.value);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const maxPoint = trend.find((point) => point.value === max);
  const minPoint = trend.find((point) => point.value === min);
  return `本周累计播放 ${total.toLocaleString()} 次，${maxPoint?.label ?? ""} ${max.toLocaleString()} 次最高，${minPoint?.label ?? ""} ${min.toLocaleString()} 次最低`;
}

function buildGreeting(
  vm: DashboardViewModel,
  displayName: string,
): string {
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  void vm; // reserved for future variation by todos/suggestions count
  return `早上好, ${firstName}!`;
}

/**
 * [FE-M04] 首页副标题:聚合**真实**待办(未完成任务 + 创作建议)。原实现只看
 * suggestions,todos>0 时仍谎报「所有任务都已处理完」。只有两者都为空才说「暂无」——
 * 诚实,不伪造「全部处理完」。
 */
export function buildDashboardSubtext(
  todoCount: number,
  suggestionCount: number,
): string {
  if (todoCount + suggestionCount === 0) {
    return "今天暂无待办与创作建议。";
  }
  const parts = [
    todoCount > 0 ? `${todoCount} 项待办` : null,
    suggestionCount > 0 ? `${suggestionCount} 条创作建议` : null,
  ].filter(Boolean);
  return `今天有 ${parts.join("、")}待处理。`;
}
