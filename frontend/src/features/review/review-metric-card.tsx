/**
 * `ReviewMetricCard` — 复盘页专用紧凑指标卡([T-329] 指标全量展示 12 张)。
 *
 * 与共享 `MetricCard`(components/project/metric-card.tsx,七个页面在用)的差异:
 *  - 更紧凑:字号缩一档(数值 text-lg,不超过 text-xl 级)、内边距更小,
 *    适配 auto-fit minmax 响应式网格(12 卡自然折成两/三排);
 *  - label 一行截断 + title 提示(hover 看全名),不再被「(待采集)」后缀撑长;
 *  - 「待采集」这类提示走卡内小字副标签(`note`),与数值分离。
 *
 * 共享 MetricCard 不动(别的页面布局依赖它);data-slot 沿用 "metric-card"
 * 以保持既有测试/遥测选择器(核心指标行内的卡)。Server-safe(无交互)。
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import type { MetricCard as MetricCardVm } from "@/types/view-models";

const TONE_TEXT: Record<MetricCardVm["tone"], string> = {
  neutral: "text-foreground",
  positive: "text-success",
  negative: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

const TREND_GLYPH: Record<MetricCardVm["trend"], string> = {
  up: "▲",
  down: "▼",
  flat: "—",
};

export function ReviewMetricCard({
  metric,
  className,
}: {
  readonly metric: MetricCardVm;
  readonly className?: string;
}) {
  return (
    <article
      role="article"
      aria-label={metric.label}
      data-slot="metric-card"
      data-tone={metric.tone}
      data-trend={metric.trend}
      id={metric.id}
      className={cn(
        "flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-surface px-3 py-2.5 shadow-card",
        className,
      )}
    >
      <span
        className="truncate text-[11px] font-medium text-muted-foreground"
        title={metric.label}
      >
        {metric.label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold leading-tight tabular-nums text-foreground">
          {metric.value}
        </span>
        {/* [T-054] 无真环比(空/「—」占位)时不渲染 delta 徽标。 */}
        {metric.delta && metric.delta !== "—" ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-medium",
              TONE_TEXT[metric.tone],
            )}
          >
            <span aria-hidden="true">{TREND_GLYPH[metric.trend]}</span>
            <span>{metric.delta}</span>
          </span>
        ) : null}
      </div>
      {/* [T-329] 卡内小字副标签(如「待采集」)——诚实标注数据缺口,不撑长 label。 */}
      {metric.note ? (
        <span
          data-slot="metric-card-note"
          className="text-[10px] leading-tight text-muted-foreground"
        >
          {metric.note}
        </span>
      ) : null}
    </article>
  );
}
