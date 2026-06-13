/**
 * `ProjectStageStepper` is the canonical six-stage project progress
 * indicator. It is used by the TopHeader in `project-workspace` mode and
 * by the Project Overview header.
 *
 * Server component: no interactivity required (it is informational only;
 * the workspace's primary action lives in the header).
 */

import * as React from "react";

import { cn } from "@/lib/utils";

import type { ProjectStageName } from "@/types/domain";

export interface ProjectStageStepperStage {
  readonly id: ProjectStageName;
  readonly label: string;
  readonly status: "pending" | "in_progress" | "completed" | "skipped";
}

export interface ProjectStageStepperProps {
  readonly currentStage: ProjectStageName;
  readonly stages: ReadonlyArray<ProjectStageStepperStage>;
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
  currentStage,
  stages,
  className,
}: ProjectStageStepperProps) {
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
        const isCurrent = stage.id === currentStage;
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
