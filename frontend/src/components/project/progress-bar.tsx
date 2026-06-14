/**
 * `ProgressBar` is the standard horizontal progress indicator used by
 * Projects, Project Overview, every workspace, and all progress displays.
 *
 * Server component by default; a sibling `InteractiveProgressBar` (not in
 * scope for Task 7) is the only place we would need a client island.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  readonly value: number;
  readonly max?: number;
  readonly label?: string;
  readonly showValue?: boolean;
  readonly className?: string;
  readonly trackClassName?: string;
  readonly tone?: "brand" | "success" | "warning";
}

const TONE_BG: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
};

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  className,
  trackClassName,
  tone = "brand",
}: ProgressBarProps) {
  const safeValue = clamp(value, 0, max);
  const percent = (safeValue / max) * 100;
  const accessibleLabel = label ?? "进度";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={safeValue}
      aria-valuetext={`${Math.round(percent)}%`}
      aria-label={accessibleLabel}
      data-slot="progress-bar"
      data-tone={tone}
      className={cn("flex w-full flex-col gap-1", className)}
    >
      {showValue ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {label ? <span>{label}</span> : <span />}
          <span className="tabular-nums">{Math.round(percent)}%</span>
        </div>
      ) : null}
      <div
        className={cn(
          "h-2 w-full overflow-hidden rounded-full bg-muted",
          trackClassName,
        )}
        data-slot="progress-bar-track"
      >
        <div
          data-slot="progress-bar-fill"
          aria-hidden="true"
          className={cn("h-full transition-all", TONE_BG[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
