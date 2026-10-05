"use client";

/**
 * `ViewsTrendChart` — the播放趋势 chart for the Analytics & Review page,
 * rendered with ECharts (T-035b, replacing the inline-SVG `ChartFrame`).
 *
 * HONESTY (task §2 / constitution §8): a real project usually carries a SINGLE
 * cumulative snapshot (no per-day series). We NEVER fabricate a daily curve from
 * one total. The caller passes `mode`:
 *   - "daily":  ≥2 distinct capture dates → a real line over the day series.
 *   - "single": exactly 1 capture date → a single labelled point + an explicit
 *               「需多次采集积累日趋势」note (no invented curve).
 *   - "empty":  no data → the caller renders its own empty state (not this).
 *
 * The line uses the project brand token; axes / tooltip follow the design
 * tokens (light / dark) via `useChartTokens`. A sr-only summary keeps the data
 * accessible by text (D-007). SSR-safe: `EChart` is client-only.
 */

import * as React from "react";
import type { EChartsOption } from "echarts";

import { EChart, useChartTokens } from "@/components/analytics/echarts-base";
import { EmptyChartGrid } from "./empty-chart-grid";

export interface TrendPoint {
  readonly label: string;
  readonly value: number | null;
}

export type ViewsTrendMode = "daily" | "single" | "empty";

export interface ViewsTrendChartProps {
  readonly data: ReadonlyArray<TrendPoint>;
  readonly mode: ViewsTrendMode;
  readonly summary: string;
  readonly slot?: string;
  readonly testId?: string;
  readonly unit?: string;
  readonly valueLabel?: string;
}

export function ViewsTrendChart({
  data,
  mode,
  summary,
  slot = "views-trend-chart",
  testId = "views-trend-chart",
  unit = "次",
  valueLabel = "播放量",
}: ViewsTrendChartProps) {
  const tokens = useChartTokens();
  const validCount = data.filter((point) => typeof point.value === "number" && Number.isFinite(point.value)).length;
  const isSingle = mode === "single" || validCount <= 1;

  const option = React.useMemo<EChartsOption>(() => {
    const labels = data.map((d) => d.label);
    const values = data.map((d) => typeof d.value === "number" && Number.isFinite(d.value) ? d.value : null);
    const minimum = Math.min(0, ...values.filter((value): value is number => value !== null));
    return {
      grid: { left: 8, right: 12, top: 32, bottom: 40, containLabel: true },
      tooltip: {
        trigger: "axis" as const,
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderWidth: 1,
        textStyle: { color: tokens.foreground, fontSize: 12 },
        valueFormatter: (v) =>
          typeof v === "number" ? `${v.toLocaleString("zh-CN")} ${unit}` : "暂无数据",
      },
      xAxis: {
        type: "category" as const,
        name: "日期",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: tokens.mutedForeground, fontSize: 12 },
        data: labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: tokens.border } },
        axisTick: { show: false },
        axisLabel: { color: tokens.mutedForeground, fontSize: 12 },
      },
      yAxis: {
        type: "value" as const,
        name: `${valueLabel}（${unit}）`,
        nameTextStyle: { color: tokens.mutedForeground, fontSize: 12 },
        min: minimum < 0 ? undefined : 0,
        axisLine: { show: true, lineStyle: { color: tokens.border } },
        splitLine: { lineStyle: { color: tokens.border, opacity: 0.5 } },
        axisLabel: {
          color: tokens.mutedForeground,
          fontSize: 12,
          formatter: (v: number) =>
            typeof v === "number" && v >= 10000
              ? `${(v / 10000).toFixed(1)}万`
              : `${v}`,
        },
      },
      series: [
        {
          name: valueLabel,
          type: "line" as const,
          data: values,
          smooth: false,
          connectNulls: false,
          // Single point → show the symbol (a lone point reads as data, not a
          // flat line pretending to be a trend).
          showSymbol: isSingle || values.some((value) => value === null),
          symbolSize: isSingle ? 9 : 6,
          lineStyle: { color: tokens.brand, width: 2 },
          itemStyle: { color: tokens.brand },
          areaStyle: isSingle
            ? undefined
            : {
                color: {
                  type: "linear" as const,
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: withAlpha(tokens.brand, 0.22) },
                    { offset: 1, color: withAlpha(tokens.brand, 0.02) },
                  ],
                },
              },
        },
      ],
    };
  }, [data, isSingle, tokens, unit, valueLabel]);

  return (
    <figure
      role="figure"
      data-slot={slot}
      data-shape="line"
      data-trend-mode={mode}
      aria-label={`${valueLabel}趋势`}
      className="flex flex-col gap-1"
    >
      {validCount === 0 ? <EmptyChartGrid message="暂无趋势数据" dateLabels={data.map(point=>point.label)}/> : <EChart
        option={option}
        testId={testId}
        className="h-40 w-full"
        style={{ height: "10rem", width: "100%" }}
      />}
      {isSingle && validCount > 0 ? (
        <p
          data-slot="views-trend-single-note"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          数据刚更新了一次,还画不出走势;过几天再来看趋势。
        </p>
      ) : null}
      <p data-slot="chart-summary" className="sr-only">
        {summary}
      </p>
    </figure>
  );
}

/** Convert a `#rrggbb` / `rgb(...)` token to an rgba string with the given alpha. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (hex.startsWith("#") && (hex.length === 7 || hex.length === 4)) {
    const full =
      hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    const r = parseInt(full.slice(1, 3), 16);
    const g = parseInt(full.slice(3, 5), 16);
    const b = parseInt(full.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // Non-hex (e.g. already rgb()) → approximate with the raw channels at reduced
  // opacity via rgba wrapping when possible.
  const m = hex.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").slice(0, 3).map((s) => s.trim());
    return `rgba(${parts.join(", ")}, ${alpha})`;
  }
  return hex;
}
