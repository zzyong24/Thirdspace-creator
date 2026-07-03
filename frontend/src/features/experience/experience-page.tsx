/**
 * 经验裁决台 page(T-062a · SPEC 2026-07-03-knowledge-learnings-redesign §2)。
 *
 * `/experience` 从「7 标签分类浏览」重构为**待裁决队列优先**的两栏工作台
 * (沿用 topics-page 的固定高度独立框滚范式):
 *
 *   ExperiencePage
 *   ├── Header(标题 + Copilot 深链「记一条经验」,旧快速记录表单退役 §2.4)
 *   ├── SummaryCards(3 张真值卡:待裁决 / 已验证 / 已回流校准)
 *   └── Workbench(flex-1,两栏各自框内滚)
 *       ├── 左 = AdjudicationQueue(candidate 倒序,采纳/不采/inline 编辑)
 *       └── 右 = ValidatedLibrary(validated 按 learningType 分组折叠 +
 *                回流校准内联表单 + 底部 discarded 折叠区带「翻案」)
 *
 * 诚实规范(§6.2):learnings.list 读失败 → 错误态(不渲染工作台,禁 fixture
 * 兜底);空 candidate 队列 → 空态文案;「已回流校准」读侧只有 pending 建议,
 * 第三张卡计「待采纳」真值,读失败显「—」。
 *
 * 页面是 Server Component;交互全部在 client 岛
 * (experience-interactive-region.tsx)。Shell(Sidebar/TopHeader)由
 * `(creator)/layout.tsx` 挂载,这里不渲染。
 */

import * as React from "react";

import type { ExperienceViewModel } from "./experience-data";
import {
  AdjudicationQueue,
  ExperienceCaptureLink,
  ValidatedLibrary,
  type ApplyTarget,
} from "./experience-interactive-region";

export type { ExperienceViewModel } from "./experience-data";
export type { ApplyTarget } from "./experience-interactive-region";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export interface ExperiencePageProps {
  /** 读侧装配的真值 VM(buildExperienceWorkspaceViewModel);测试可直接注入。 */
  readonly viewModel: ExperienceViewModel;
  /**
   * 「应用到项目」的目标项目(projects.list)。空 ⇒ 应用控件隐藏。
   */
  readonly applyTargets?: ReadonlyArray<ApplyTarget>;
}

export function ExperiencePage({
  viewModel,
  applyTargets = [],
}: ExperiencePageProps) {
  return (
    <main
      data-app="creatoros"
      data-page="experience"
      data-experience-id="experience-root"
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <header className="flex shrink-0 items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">经验裁决台</h1>
          <p className="text-sm text-muted-foreground">
            复盘产出的经验候选在这里裁决——采纳沉淀为约束规则，回流校准评分标准。
          </p>
        </div>
        {/* §2.4:旧 RightRail「快速记录」表单退役 → Copilot 深链预填(只预填不发送)。 */}
        <ExperienceCaptureLink />
      </header>

      <SummaryCards summary={viewModel.summary} loadError={viewModel.loadError} />

      {viewModel.loadError ? (
        <div
          data-slot="experience-load-error"
          role="alert"
          className="rounded-card border border-danger/30 bg-danger/5 px-4 py-6 text-center text-sm text-danger"
        >
          经验数据读取失败，请刷新重试。
        </div>
      ) : (
        <div
          data-slot="experience-workbench"
          className="grid min-h-0 flex-1 grid-cols-1 gap-card-gap lg:grid-cols-2"
        >
          <WorkbenchColumn
            title="裁决队列"
            hint="待裁决的经验候选，按产生时间倒序"
            count={viewModel.candidates.length}
          >
            <AdjudicationQueue candidates={viewModel.candidates} />
          </WorkbenchColumn>
          <WorkbenchColumn
            title="已验证经验库"
            hint="按类型分组的已验证规则；不采的收在底部可翻案"
            count={viewModel.validated.length}
          >
            <ValidatedLibrary
              validated={viewModel.validated}
              discarded={viewModel.discarded}
              reflowedLearningIds={viewModel.reflowedLearningIds}
              applyTargets={applyTargets}
            />
          </WorkbenchColumn>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// 顶部 3 张真值汇总卡(§2.1)
// ---------------------------------------------------------------------------

function SummaryCards({
  summary,
  loadError,
}: {
  summary: ExperienceViewModel["summary"];
  loadError: boolean;
}) {
  // 读失败时计数不可信 → 全部「—」(诚实,不显 0 装作空库)。
  const cards = [
    {
      id: "exp-candidates",
      label: "待裁决",
      value: loadError ? "—" : String(summary.candidateCount),
    },
    {
      id: "exp-validated",
      label: "已验证",
      value: loadError ? "—" : String(summary.validatedCount),
    },
    {
      // 读侧只有 PENDING 回流建议(采纳后从 list 消失),这里计的是
      // 「已回流·待校准中心采纳」的真值;calibration.suggestions.list 不可用
      // 时为 null → 诚实显「—」。
      id: "exp-reflowed",
      label: "已回流校准（待采纳）",
      value:
        loadError || summary.reflowPendingCount === null
          ? "—"
          : String(summary.reflowPendingCount),
    },
  ];
  return (
    <section
      data-slot="experience-summary-cards"
      aria-label="经验裁决汇总"
      className="grid shrink-0 grid-cols-1 gap-card-gap sm:grid-cols-3"
    >
      {cards.map((card) => (
        <article
          key={card.id}
          data-slot="summary-card"
          data-summary-id={card.id}
          aria-label={card.label}
          className="flex flex-col gap-1.5 rounded-xl bg-surface-subtle px-4 py-3"
        >
          <span className="text-xs font-medium text-muted-foreground">
            {card.label}
          </span>
          <span className="text-[22px] font-semibold leading-tight tabular-nums text-foreground">
            {card.value}
          </span>
        </article>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 工作台栏框(固定高度,框内滚 —— topics-page 范式)
// ---------------------------------------------------------------------------

function WorkbenchColumn({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section
      data-slot="workbench-column"
      aria-label={title}
      className="flex min-h-0 flex-col gap-2 rounded-card border border-border bg-surface p-3"
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {count} 条
        </span>
      </div>
      {children}
    </section>
  );
}
