/**
 * `MetricCard` renders a single labelled metric with a value, delta, and
 * tone. It is consumed by Dashboard, Analytics, Knowledge, Publishing
 * Center, Project Overview, Settings, Experience — i.e. it appears on
 * seven pages, so it is approved for the shared inventory.
 *
 * Server component: no interactivity required.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export type MetricTrend = "up" | "down" | "flat";
export type MetricTone = "neutral" | "positive" | "negative" | "warning" | "info";

export interface MetricCardProps {
  readonly id?: string;
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly trend: MetricTrend;
  readonly tone: MetricTone;
  readonly className?: string;
}

const TONE_TEXT: Record<MetricTone, string> = {
  neutral: "text-foreground",
  positive: "text-success",
  negative: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

const TREND_GLYPH: Record<MetricTrend, string> = {
  up: "▲",
  down: "▼",
  flat: "—",
};

export function MetricCard({
  id,
  label,
  value,
  delta,
  trend,
  tone,
  className,
}: MetricCardProps) {
  return (
    <article
      role="article"
      aria-label={label}
      data-slot="metric-card"
      data-tone={tone}
      data-trend={trend}
      {...(id ? { id } : {})}
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border bg-surface p-(--card-gap) shadow-card",
        className,
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-foreground">
          {value}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            TONE_TEXT[tone],
          )}
        >
          <span aria-hidden="true">{TREND_GLYPH[trend]}</span>
          <span>{delta}</span>
        </span>
      </div>
    </article>
  );
}
