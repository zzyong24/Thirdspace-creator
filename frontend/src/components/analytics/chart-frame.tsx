/**
 * `ChartFrame` is the canonical chart container used by Dashboard,
 * Analytics & Review, Publishing Center, and Experience.
 *
 * It composes `SectionCard` with a deterministic sparkline-style
 * rendering and a guaranteed textual summary, so the chart is not
 * conveyed by color alone (D-007).
 *
 * Server component: the rendering is a static SVG; no client
 * interactivity is required.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";

export interface ChartFrameTrendPoint {
  readonly label: string;
  readonly value: number;
}

export interface ChartFrameProps {
  readonly title: string;
  readonly summary: string;
  readonly trend: ReadonlyArray<ChartFrameTrendPoint>;
  readonly description?: string;
  readonly height?: number;
  readonly className?: string;
  readonly testId?: string;
  /**
   * Optional override for the figure's `data-slot`. When provided, the
   * chart exposes the supplied slot name in addition to the default
   * `chart-frame` marker, so callers can target a specific chart from
   * tests or per-chart styling hooks.
   */
  readonly slot?: string;
  /**
   * Optional `data-shape` value (e.g. `line`, `funnel`). Mirrors the
   * inline-SVG charts so tests can assert the visual shape category
   * uniformly across the page.
   */
  readonly shape?: string;
}

const CHART_PADDING = 8;
const STROKE_WIDTH = 1.5;

export function ChartFrame({
  title,
  summary,
  trend,
  description,
  height = 80,
  className,
  testId,
  slot,
  shape,
}: ChartFrameProps) {
  const { path, viewBox, maxValue, minValue } = buildPath(trend, height);
  return (
    <SectionCard
      title={title}
      description={description}
      className={className}
    >
      <figure
        role="figure"
        aria-label={title}
        data-slot={slot ?? "chart-frame"}
        data-shape={shape}
        data-testid={testId}
        className="flex flex-col gap-2"
      >
        <svg
          data-slot="chart-frame-svg"
          viewBox={viewBox}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="h-20 w-full overflow-visible"
        >
          <path
            d={path}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={STROKE_WIDTH}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        <figcaption className="sr-only" data-slot="chart-summary">
          <span data-slot="chart-frame-summary" className="sr-only">
            {summary}
          </span>
        </figcaption>
        <div
          aria-hidden="true"
          className="flex items-center justify-between text-xs text-muted-foreground tabular-nums"
        >
          <span>{trend[0]?.label ?? ""}</span>
          <span>
            最高 {maxValue.toLocaleString()} · 最低 {minValue.toLocaleString()}
          </span>
          <span>{trend[trend.length - 1]?.label ?? ""}</span>
        </div>
      </figure>
    </SectionCard>
  );
}

function buildPath(
  trend: ReadonlyArray<ChartFrameTrendPoint>,
  height: number,
): { path: string; viewBox: string; maxValue: number; minValue: number } {
  if (trend.length === 0) {
    return {
      path: "",
      viewBox: `0 0 0 ${height}`,
      maxValue: 0,
      minValue: 0,
    };
  }
  const values = trend.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const widthUnits = trend.length - 1 || 1;
  const step = (100 - CHART_PADDING * 2) / widthUnits;
  const points = trend.map((point, index) => {
    const x = CHART_PADDING + step * index;
    const normalized = (point.value - min) / range;
    const y = CHART_PADDING + (1 - normalized) * (height - CHART_PADDING * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return {
    path: `M ${points.join(" L ")}`,
    viewBox: `0 0 100 ${height}`,
    maxValue: max,
    minValue: min,
  };
}
