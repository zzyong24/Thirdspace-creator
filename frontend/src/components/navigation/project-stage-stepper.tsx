/**
 * `ProjectStageStepper` is the canonical six-stage project progress
 * indicator (SPEC §5, §7). A single component serves both surfaces:
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

export interface ProjectStageStepperStage {
  readonly id: string;
  readonly label: string;
  readonly status: "pending" | "in_progress" | "completed" | "skipped";
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
  pending: "bg-border-strong",
  skipped: "bg-warning",
};

const STATUS_TEXT: Record<ProjectStageStepperStage["status"], string> = {
  completed: "text-foreground",
  in_progress: "text-foreground",
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
        aria-label="项目六阶段"
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
          // Reachable = current stage, any earlier/already-reached stage, or
          // the immediate next stage. Stages further ahead stay gated.
          const reachable =
            currentIndex === -1
              ? false
              : index <= currentIndex + 1;
          const navigable = reachable && Boolean(projectId);
          const segmentClassName = cn(
            "flex h-full w-full items-center justify-center gap-1 border-y border-r border-border bg-surface px-3 text-xs text-muted-foreground",
            index === 0 && "border-l",
            stage.status === "in_progress" &&
              "border-brand/30 bg-brand-soft font-medium text-brand",
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
                  href={`/projects/${projectId}/${stage.id}`}
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
      aria-label="项目六阶段"
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
