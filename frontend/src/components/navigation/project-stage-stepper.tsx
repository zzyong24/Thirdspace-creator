/**
 * `ProjectStageStepper` is the canonical six-stage project progress
 * indicator (SPEC §5, §7). A single component serves both surfaces:
 *
 *  - `variant="compact"` (default): the dot + label + connector strip used
 *    by the Project Overview progress card.
 *  - `variant="segmented"`: the boxed segmented strip rendered inside the
 *    TopHeader in `project-workspace` mode.
 *
 * Server component: no interactivity required (it is informational only;
 * the workspace's primary action lives in the header).
 */

import * as React from "react";

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
  className,
}: ProjectStageStepperProps) {
  if (variant === "segmented") {
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
        {stages.map((stage) => (
          <li
            key={stage.id}
            data-status={stage.status}
            className={cn(
              "flex h-12 min-w-24 flex-1 items-center justify-center gap-1 border-y border-r border-border bg-surface px-3 text-xs text-muted-foreground first:border-l",
              stage.status === "in_progress" &&
                "border-brand/30 bg-brand-soft font-medium text-brand",
            )}
          >
            <span
              aria-hidden="true"
              className={cn("size-1.5 rounded-full", STATUS_INDICATOR[stage.status])}
            />
            {stage.label}
          </li>
        ))}
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
