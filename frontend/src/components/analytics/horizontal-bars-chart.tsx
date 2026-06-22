/**
 * `HorizontalBarsChart` (SPEC §7, 分析) renders a horizontal bar
 * distribution as an inline SVG with an accessible textual summary
 * (D-007). It is a deterministic presentational primitive — the caller
 * supplies the `slot`/`shape` data-attributes, the `data` and a `summary`.
 *
 * Server component: no interactivity.
 */

import * as React from "react";

import type { ChartDatum } from "@/components/analytics/retention-chart";

export interface HorizontalBarsChartProps {
  readonly slot: string;
  readonly shape: string;
  readonly data: ReadonlyArray<ChartDatum>;
  readonly summary: string;
}

export function HorizontalBarsChart({
  slot,
  shape,
  data,
  summary,
}: HorizontalBarsChartProps) {
  const max = Math.max(...data.map((row) => row.value), 1);
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
        viewBox={`0 0 100 ${data.length * 12}`}
        aria-hidden="true"
        className="h-20 w-full"
      >
        {data.map((row, index) => {
          const ratio = row.value / max;
          const y = index * 12;
          return (
            <g key={row.label}>
              <rect
                x={0}
                y={y + 2}
                width={ratio * 100}
                height={8}
                fill="var(--color-brand)"
                rx={1}
              />
              <rect
                x={ratio * 100}
                y={y + 2}
                width={100 - ratio * 100}
                height={8}
                fill="var(--color-border)"
                rx={1}
              />
            </g>
          );
        })}
      </svg>
      <p data-slot="chart-summary" className="sr-only">
        {summary}
      </p>
    </figure>
  );
}
