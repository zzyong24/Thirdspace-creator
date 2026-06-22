/**
 * `RetentionChart` (SPEC §7, 分析) renders a retention curve as an inline
 * SVG path with an accessible textual summary (D-007: no information by
 * color alone). It is a deterministic presentational primitive — the
 * caller supplies the `slot`/`shape` data-attributes, the normalised
 * `data` points (value in 0..1) and a `summary` string.
 *
 * Server component: no interactivity.
 */

import * as React from "react";

export interface ChartDatum {
  readonly label: string;
  readonly value: number;
}

export interface RetentionChartProps {
  readonly slot: string;
  readonly shape: string;
  readonly data: ReadonlyArray<ChartDatum>;
  readonly summary: string;
}

export function RetentionChart({ slot, shape, data, summary }: RetentionChartProps) {
  const path = buildRetentionPath(data, 24);
  return (
    <figure
      role="figure"
      data-slot={slot}
      data-shape={shape}
      aria-label={slot}
      className="flex flex-col gap-2"
    >
      <svg
        data-slot={`${slot}-svg`}
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="h-20 w-full"
      >
        <path
          d={path}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p data-slot="chart-summary" className="sr-only">
        {summary}
      </p>
    </figure>
  );
}

export function buildRetentionPath(
  data: ReadonlyArray<ChartDatum>,
  height: number,
): string {
  if (data.length === 0) return "";
  const padding = 2;
  const width = 100;
  const range = 1; // retention is always 0..1
  const step = (width - padding * 2) / (data.length - 1 || 1);
  const points = data.map((row, index) => {
    const x = padding + step * index;
    const y = padding + (1 - row.value / range) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M ${points.join(" L ")}`;
}
