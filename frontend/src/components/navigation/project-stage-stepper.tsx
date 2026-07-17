/**
 * `ProjectStageStepper` is the canonical project progress indicator
 * (SPEC §5, §7;[T-076] 数据驱动——阶段项由调用方传入,两阶段化后为
 * 脚本 | 复盘 两项)。A single component serves both surfaces:
 *
 *  - `variant="compact"` (default): the dot + label + connector strip used
 *    by the Project Overview progress card.
 *  - `variant="segmented"`: the boxed segmented strip rendered inside the
 *    TopHeader in `project-workspace` mode.
 *
 * Server component: the segmented strip is navigable. Each segment for the
 * current stage, any earlier/already-reached stage, or the immediate next
 * stage renders as a `next/link` anchor to that stage's workspace route
 * (`/projects/<id>/<stage>`). Stages further ahead than current+1 stay gated
 * (non-clickable). Clickability requires a `projectId`; without it the segments
 * stay informational `<li>` content (e.g. when rendered outside a route).
 */

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { projectWorkspaceHref } from "@/features/projects/project-href";

export interface ProjectStageStepperStage {
  readonly id: string;
  readonly label: string;
  // §16 needs_review:阶段「声称完成」但内容 gate 未过(核心交付物缺失)的停泊态,
  // stepper 以 warning 样式标出「待补」,让创作者看到为什么进不去下一阶段。
  readonly status:
    | "pending"
    | "in_progress"
    | "needs_review"
    | "completed"
    | "skipped";
}

export interface ProjectStageStepperProps {
  readonly stages: ReadonlyArray<ProjectStageStepperStage>;
  readonly currentStage?: string;
  readonly variant?: "compact" | "segmented";
  /**
   * The route-level project id. When provided (segmented variant), reachable
   * stage segments become navigable links to `/projects/<projectId>/<stage>`.
   */
  readonly projectId?: string;
  readonly className?: string;
}

const STATUS_INDICATOR: Record<ProjectStageStepperStage["status"], string> = {
  completed: "bg-success",
  in_progress: "bg-brand",
  needs_review: "bg-warning",
  pending: "bg-border-strong",
  skipped: "bg-warning",
};

const STATUS_TEXT: Record<ProjectStageStepperStage["status"], string> = {
  completed: "text-foreground",
  in_progress: "text-foreground",
  needs_review: "text-warning",
  pending: "text-muted-foreground",
  skipped: "text-muted-foreground line-through",
};

export function ProjectStageStepper({
  stages,
  currentStage,
  variant = "compact",
  projectId,
  className,
}: ProjectStageStepperProps) {
  if (variant === "segmented") {
    // Resolve the current stage index: prefer the explicit `currentStage`,
    // else fall back to whichever segment is `in_progress`.
    const currentIndex =
      currentStage !== undefined
        ? stages.findIndex((stage) => stage.id === currentStage)
        : stages.findIndex((stage) => stage.status === "in_progress");
    return (
      <ol
        role="list"
        aria-label="项目阶段"
        data-slot="header-stage-stepper"
        data-current={currentStage}
        className={cn(
          "hidden min-w-0 flex-1 items-stretch overflow-x-auto md:flex",
          className,
        )}
      >
        {stages.map((stage, index) => {
          const isCurrent =
            currentStage !== undefined
              ? stage.id === currentStage
              : stage.status === "in_progress";
          // Reachable = any stage that has ALREADY been reached (completed /
          // in_progress / skipped — so a finished project lets you click back
          // into ANY past stage to review it), the current stage, OR the
          // immediate next stage. Stages further ahead than that stay gated.
          const alreadyReached =
            stage.status === "completed" ||
            stage.status === "in_progress" ||
            stage.status === "needs_review" ||
            stage.status === "skipped";
          const reachable =
            alreadyReached ||
            (currentIndex === -1 ? false : index <= currentIndex + 1);
          // [T-049 B1] 局部窄化:navigable 为真时 projectId 必非空(下方 Link 用它拼 href)。
          const navigableProjectId = reachable ? projectId : undefined;
          const navigable = Boolean(navigableProjectId);
          const segmentClassName = cn(
            "flex h-full w-full items-center justify-center gap-1 border-y border-r border-border bg-surface px-3 text-xs text-muted-foreground",
            index === 0 && "border-l",
            // [T-373] 高亮跟随「正在查看的面」(isCurrent),不再跟 status(项目成熟度)。
            // 此前两套判定分叉:已发布项目(currentStage=review)打开稿面(脚本工作面)
            // 时,内容是脚本、高亮却是「复盘」。成熟度仍由左侧状态点(STATUS_INDICATOR)
            // 表达;无 currentStage 时 isCurrent 退回 in_progress,旧调用方行为不变。
            isCurrent && "border-brand/30 bg-brand-soft font-medium text-brand",
            navigable
              ? "cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : !reachable && "cursor-not-allowed opacity-70",
          );
          const inner = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  STATUS_INDICATOR[stage.status],
                )}
              />
              {stage.label}
            </>
          );
          return (
            <li
              key={stage.id}
              data-status={stage.status}
              data-current={isCurrent ? "true" : "false"}
              className="flex h-12 min-w-24 flex-1 items-stretch"
            >
              {navigable ? (
                <Link
                  href={projectWorkspaceHref(navigableProjectId!, stage.id as import("@/types/domain").ProjectStageName)}
                  data-slot="header-stage-link"
                  data-testid={`stage-segment-${stage.id}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className={segmentClassName}
                >
                  {inner}
                </Link>
              ) : (
                <span
                  data-testid={`stage-segment-${stage.id}`}
                  aria-current={isCurrent ? "step" : undefined}
                  aria-disabled={!reachable ? "true" : undefined}
                  className={segmentClassName}
                >
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol
      role="list"
      aria-label="项目阶段"
      data-slot="project-stage-stepper"
      data-current={currentStage}
      className={cn(
        "flex flex-wrap items-center gap-2 overflow-x-auto",
        className,
      )}
    >
      {stages.map((stage, index) => {
        const isCurrent =
          currentStage !== undefined
            ? stage.id === currentStage
            : stage.status === "in_progress";
        return (
          <li
            key={stage.id}
            data-status={stage.status}
            data-current={isCurrent ? "true" : "false"}
            className="flex items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-block size-1.5 rounded-full",
                STATUS_INDICATOR[stage.status],
              )}
            />
            <span className={cn("text-xs", STATUS_TEXT[stage.status])}>
              {stage.label}
            </span>
            {index < stages.length - 1 ? (
              <span
                aria-hidden="true"
                className="mx-1 inline-block h-px w-3 bg-border-strong"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
