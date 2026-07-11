"use client";

/**
 * WorkspacePrimaryAction — the project-workspace header's primary affordance
 * (Plan A6).
 *
 * Previously the workspace header's "进入下一步:<next stage>" button was a plain
 * `<Link>` that only changed the URL without persisting the stage transition,
 * so a project's recorded `currentStage` desynced from the route the user was
 * looking at. This island unifies that behavior with the Project Overview page:
 * the advancing action now PERSISTS the transition through the same contract op
 * (`projects.stage.transition` / `client.transitionProjectStage`, advancing
 * `current → next`) and only then navigates to the next stage route and asks the
 * App Router to revalidate the server tree.
 *
 *   island -> client.transitionProjectStage -> store mutation
 *          -> router.push(next route) -> router.refresh()
 *
 * Non-advancing / terminal-stage actions (e.g. "完成制作", "查看数据",
 * "导出报告") have no forward stage and stay navigation-free buttons, matching
 * the prior visual behavior. We never invent a transition past the last stage.
 */

import * as React from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import type { ProjectStageName } from "@/types/domain";
// [T-209] 复盘页「导出报告」→ 就地生成自包含 HTML 报告并触发下载(数据源 = 复盘内容区
// 经 module 桥发布的 viewModel;不新拉 op)。仅 label==="导出报告"(复盘阶段)时挂此 handler。
import {
  REVIEW_EXPORT_LABEL,
  triggerReviewReportDownload,
} from "@/features/review/review-report-export";

// The project pipeline order. The next stage is the adjacent forward step;
// `review` is terminal. Mirrors the stage-transition handler's order.
const STAGE_ORDER: ReadonlyArray<ProjectStageName> = [
  "brief",
  "research",
  "planning",
  "script",
  "production",
  "publishing",
  "review",
];

function nextStageOf(stage: string): ProjectStageName | null {
  const idx = STAGE_ORDER.indexOf(stage as ProjectStageName);
  if (idx === -1 || idx >= STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1] ?? null;
}

export interface WorkspacePrimaryActionProps {
  readonly label: string;
  /**
   * The route-level project id (the `/projects/<routeProjectId>/<stage>` path
   * segment), used both for the transition op param and the navigation target.
   */
  readonly routeProjectId: string;
  readonly currentStage: string;
  /**
   * Whether this label represents a forward "进入下一步" advance. When false the
   * action is terminal/non-advancing and behaves as a plain button (no
   * transition, no navigation), preserving prior behavior.
   */
  readonly advances: boolean;
  /**
   * [T-209] 项目标题(header identity 携带)。仅「导出报告」用于报告标题/文件名;
   * 其它阶段忽略。
   */
  readonly projectTitle?: string;
}

export function WorkspacePrimaryAction({
  label,
  routeProjectId,
  currentStage,
  advances,
  projectTitle,
}: WorkspacePrimaryActionProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const nextStage = advances ? nextStageOf(currentStage) : null;
  const canAdvance = advances && nextStage !== null && routeProjectId !== "";
  // [T-209] 复盘页导出报告:非跳转动作,只在 label 命中「导出报告」时挂 handler,
  // 绝不影响其它阶段的 primaryAction(它们要么是「进入下一步」跳转,要么无按钮)。
  const isExportReport = !advances && label === REVIEW_EXPORT_LABEL;
  const [exportHint, setExportHint] = React.useState<string | null>(null);
  const onExport = React.useCallback(() => {
    const ok = triggerReviewReportDownload({ projectTitle });
    setExportHint(ok ? "已开始下载报告" : "暂无可导出的复盘数据");
  }, [projectTitle]);

  const onAdvance = React.useCallback(() => {
    if (pending || !canAdvance || !nextStage) return;
    setPending(true);
    void (async () => {
      try {
        // Persist the transition (current → next) through the SAME op the
        // overview page uses — but it is BEST-EFFORT navigation: advancing is
        // only legal from a pending/in_progress stage. On a COMPLETED project
        // (every stage already done) the machine rejects re-advancing a
        // completed stage, and that's fine — the user is just browsing forward,
        // so we navigate regardless of whether the transition mutated anything.
        try {
          await client.transitionProjectStage({
            params: { projectId: routeProjectId, stage: nextStage },
            query: undefined,
            body: {},
          });
        } catch {
          // Already-completed / terminal stage → no mutation, navigate anyway.
        }
        router.push(`/projects/${routeProjectId}/${nextStage}`);
        router.refresh();
      } finally {
        setPending(false);
      }
    })();
  }, [canAdvance, nextStage, pending, routeProjectId, router]);

  if (isExportReport) {
    // [T-209] 复盘页「导出报告」:非跳转终态动作,点击就地生成自包含报告并触发下载。
    return (
      <span className="flex flex-col items-end gap-0.5">
        <Button type="button" size="lg" onClick={onExport}>
          {label} →
        </Button>
        {exportHint ? (
          <span
            data-slot="export-report-hint"
            className="text-[11px] text-muted-foreground"
          >
            {exportHint}
          </span>
        ) : null}
      </span>
    );
  }

  if (!canAdvance) {
    // [T-231⑧] 终态/非推进 label(且非「导出报告」)接不了真动作 —— 原来渲成
    // `<Button>{label} →</Button>`(无 onClick 的死按钮,看着能点实际没反应)。
    // 现状 shell-router 只产出「导出报告」一种非推进 label(上面分支已接真下载),
    // 本分支实际不可达;为防未来 label 源扩展再造死按钮,这里渲**纯文本状态徽标**
    // (无按钮语义、无 hover、无「→」诱点),诚实呈现而不是伪装可点。
    return (
      <span
        data-slot="workspace-terminal-status"
        className="inline-flex h-10 items-center rounded-control border border-border bg-surface-subtle px-4 text-sm font-medium text-muted-foreground"
      >
        {label}
      </span>
    );
  }

  return (
    <Button type="button" size="lg" disabled={pending} onClick={onAdvance}>
      {label} →
    </Button>
  );
}

export default WorkspacePrimaryAction;
