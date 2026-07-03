/**
 * 今日台(T-063b · 北极星 SPEC §3)—— 首页从「路标」变「行动队列」。
 *
 * 页面主体是统一行动队列(六类源:project/candidate/learning/calibration/publish/
 * signal),每行 = 图标 + 一句话(带真实对象名/数字)+ 一键直达深链;保留问候头、
 * 「继续创作」卡、一条真值趋势行(近 7 天播放);移除旧的路标卡(热门选题/最近发布/
 * 数据概览大图/创作建议 —— 内容已被队列吸收或在作品页)。
 *
 * 数据装配全在 `dashboard-data.ts`(六源全部复用既有读 op,无新契约;逐源降级,
 * 核心 getDashboard 失败才整页错误态)。本文件是纯渲染的 Server Component ——
 * 无 Date.now / Math.random / fetch。
 */

import * as React from "react";
import { STAGE_LABELS as CANONICAL_STAGE_LABELS } from "@/lib/stage-labels";
import Link from "next/link";
import {
  ClipboardCheck,
  Lightbulb,
  MessageSquare,
  Rocket,
  Send,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { StatusBadge } from "@/components/project/status-badge";
import { ProgressBar } from "@/components/project/progress-bar";
import { TagChip } from "@/components/content/tag-chip";
import {
  canonicalDataset,
  getProjectPlatforms,
} from "@/fixtures/canonical";
import { cn } from "@/lib/utils";
import type { ContinueCreating, DashboardViewModel } from "@/types/view-models";
import type { ProjectStageName } from "@/types/domain";

import {
  buildTodayViewModel,
  type TodayActionKind,
  type TodayActionVm,
  type TodayViewModel,
} from "./dashboard-data";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DashboardPageProps {
  /** Override hook for tests; defaults to the production assembly. */
  readonly viewModel?: TodayViewModel;
  /**
   * Override for the displayed greeting name (test seam). In production the
   * greeting uses the real account holder — `canonicalDataset.user.displayName`,
   * the same source the sidebar's `resolveUser` reads.
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
  const vm = viewModel ?? (await buildTodayViewModel());

  // 核心 getDashboard 读失败 → 诚实错误态(禁 fixture 兜底)。
  // `== null` 同时挡 null/undefined(HMR/异形 vm 注入时不至于渲染崩溃)。
  if (vm.loadError || vm.dashboard == null) {
    return (
      <main
        data-app="creatoros"
        data-page="dashboard"
        className="flex flex-col gap-section-gap"
      >
        <div
          data-slot="dashboard-load-error"
          role="alert"
          className="flex flex-col items-start gap-2 rounded-card border border-danger/40 bg-danger/5 p-6"
        >
          <h1 className="font-heading text-lg font-semibold text-foreground">
            今日台加载失败
          </h1>
          <p className="text-sm text-muted-foreground">
            工作台数据暂时读不出来,请刷新重试。
          </p>
        </div>
      </main>
    );
  }

  const dashboard = vm.dashboard;
  const greeting = buildGreeting(
    greetingName ?? canonicalDataset.user.displayName,
  );

  return (
    <main
      data-app="creatoros"
      data-page="dashboard"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-0.5">
        <h1
          data-slot="dashboard-welcome"
          className="font-heading text-xl font-semibold text-foreground"
        >
          {greeting}
        </h1>
        <p className="text-sm text-muted-foreground">
          {vm.actions.length > 0
            ? `今天有 ${vm.actions.length} 件事排上了。`
            : "今天没有排上的事。"}
        </p>
      </header>

      <TrendLine trend={dashboard.dataOverview.trend} />

      <section
        aria-label="工作台"
        className="grid grid-cols-1 items-start gap-card-gap lg:grid-cols-3"
      >
        <div className="lg:col-span-2">
          <TodayQueue actions={vm.actions} />
        </div>
        <ContinueCreatingCard
          continueCreating={dashboard.continueCreating}
          projectPlatforms={getProjectPlatformLabels(
            dashboard.continueCreating.projectId,
          )}
        />
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 行动队列(今日台的灵魂)
// ---------------------------------------------------------------------------

const ACTION_ICONS: Record<TodayActionKind, LucideIcon> = {
  project: Rocket,
  candidate: Lightbulb,
  learning: ClipboardCheck,
  calibration: SlidersHorizontal,
  publish: Send,
  signal: MessageSquare,
};

const ACTION_KIND_LABELS: Record<TodayActionKind, string> = {
  project: "推进",
  candidate: "选题",
  learning: "经验",
  calibration: "校准",
  publish: "发布/复盘",
  signal: "信号",
};

function TodayQueue({ actions }: { actions: ReadonlyArray<TodayActionVm> }) {
  return (
    <section data-slot="today-queue" aria-label="今日行动队列">
      <SectionCard
        title="今日行动"
        description={
          actions.length > 0
            ? `${actions.length} 件今天该干的事,点一下直达`
            : "今天的队列是空的"
        }
      >
        {actions.length === 0 ? (
          <TodayQueueEmpty />
        ) : (
          <ul
            data-slot="today-action-list"
            aria-label="今日行动"
            className="flex flex-col gap-2"
          >
            {actions.map((action) => {
              const Icon = ACTION_ICONS[action.kind];
              return (
                <li
                  key={action.id}
                  data-slot="today-action"
                  data-kind={action.kind}
                >
                  <Link
                    href={action.href}
                    data-slot="today-action-link"
                    className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-brand/40 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {action.text}
                    </span>
                    <TagChip
                      label={ACTION_KIND_LABELS[action.kind]}
                      tone="info"
                      size="sm"
                    />
                    <span aria-hidden="true" className="text-brand">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </section>
  );
}

/** 全空引导空态:把人送去出选题(Copilot 深链,就地开浮层不跳页)。 */
function TodayQueueEmpty() {
  return (
    <div
      data-slot="today-queue-empty"
      className="flex flex-col items-start gap-2 rounded-card border border-dashed border-border bg-surface-subtle px-3.5 py-4"
    >
      <p className="text-sm text-muted-foreground">
        今天没有排上的事——去出一批选题?
      </p>
      {/* query-only href(以 `?` 开头)= 保持当前路径就地开 Copilot 浮层(bug #3 机制);
          surface/fn 同 topic-generate-island 的出题深链。 */}
      <Link
        href="?copilot=open&surface=topics&fn=topic.generate"
        data-slot="today-queue-empty-cta"
        className="text-sm font-medium text-brand hover:underline"
      >
        和编导聊聊,出一批选题 →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 一条真值趋势行(原数据概览大图缩为单行迷你趋势 + 本周播放数字)
// ---------------------------------------------------------------------------

function TrendLine({
  trend,
}: {
  trend: ReadonlyArray<{ label: string; value: number }>;
}) {
  const total = trend.reduce((sum, point) => sum + point.value, 0);
  const max = Math.max(1, ...trend.map((point) => point.value));
  return (
    <section
      data-slot="dashboard-trend-line"
      aria-label="本周播放趋势"
      className="flex items-center justify-between gap-4 rounded-card border border-border bg-surface px-4 py-3"
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-sm text-muted-foreground">近 7 天播放</span>
        <span
          data-slot="trend-week-total"
          className="text-lg font-semibold tabular-nums text-foreground"
        >
          {trend.length > 0 ? total.toLocaleString() : "—"}
        </span>
        <span className="text-xs text-muted-foreground">次</span>
      </div>
      {trend.length > 0 ? (
        <div
          aria-hidden="true"
          className="flex h-8 shrink-0 items-end gap-1"
          title={trend
            .map((point) => `${point.label} ${point.value.toLocaleString()}`)
            .join(" · ")}
        >
          {trend.map((point) => (
            <span
              key={point.label}
              data-slot="trend-bar"
              className="w-2 rounded-sm bg-brand/60"
              style={{ height: `${Math.max(8, (point.value / max) * 100)}%` }}
            />
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">本周暂无播放数据</span>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 继续创作(保留:最近项目直达稿面/阶段工作面)
// ---------------------------------------------------------------------------

function ContinueCreatingCard({
  continueCreating,
  projectPlatforms,
}: {
  continueCreating: ContinueCreating;
  projectPlatforms: ReadonlyArray<string>;
}) {
  // D3:项目行直达其当前阶段工作面 —— 当前阶段就是该继续的地方。
  const projectHref = `/projects/${continueCreating.projectId}/${continueCreating.stage}`;
  return (
    <div data-slot="continue-creating-card">
      <SectionCard title="继续创作" description="最近编辑的项目与下一步行动">
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
              {projectPlatforms.map((platform) => (
                <TagChip key={platform} label={platform} tone="brand" size="sm" />
              ))}
              <TagChip
                label={stageLabel(continueCreating.stage)}
                tone="info"
                size="sm"
              />
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
// Helpers
// ---------------------------------------------------------------------------

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

function getProjectPlatformLabels(projectId: string): ReadonlyArray<string> {
  const platforms = getProjectPlatforms(projectId);
  if (platforms.length > 0) return platforms;
  // Fall back to a single "多平台" label so the row never renders empty.
  return ["多平台"];
}

function buildGreeting(displayName: string): string {
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  return `早上好, ${firstName}!`;
}

// re-export:测试与路由从页面模块取类型即可(装配实现在 dashboard-data)。
export type { TodayViewModel, TodayActionVm, TodayActionKind };
export type { DashboardViewModel };
