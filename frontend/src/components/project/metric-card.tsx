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
        "flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 shadow-card",
        className,
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-semibold leading-tight tabular-nums text-foreground">
          {value}
        </span>
        {/* [T-054] 无真环比(空/「—」占位)时不渲染 delta 徽标 —— 灰色小横杠
            全站到处挂着是「有数据但没意义」的视觉噪音。 */}
        {delta && delta !== "—" ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              TONE_TEXT[tone],
            )}
          >
            <span aria-hidden="true">{TREND_GLYPH[trend]}</span>
            <span>{delta}</span>
          </span>
        ) : null}
      </div>
    </article>
  );
}
