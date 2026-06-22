/**
 * `AudienceBreakdown` (SPEC §7, 分析) renders an audience distribution as a
 * donut chart with an accessible textual summary (D-007). It is a
 * deterministic presentational primitive — the caller supplies the
 * `slot`/`shape` data-attributes, the distribution `data` and a `summary`.
 *
 * Server component: no interactivity.
 */

import * as React from "react";

import type { ChartDatum } from "@/components/analytics/retention-chart";

export interface AudienceBreakdownProps {
  readonly slot: string;
  readonly shape: string;
  readonly data: ReadonlyArray<ChartDatum>;
  readonly summary: string;
}

export function AudienceBreakdown({
  slot,
  shape,
  data,
  summary,
}: AudienceBreakdownProps) {
  const total = data.reduce((sum, row) => sum + row.value, 0) || 1;
  const segments = data.map((row, index) => {
    const fraction = row.value / total;
    const start = data
      .slice(0, index)
      .reduce((acc, prev) => acc + prev.value / total, 0);
    return { row, fraction, start };
  });
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
        viewBox="0 0 42 42"
        aria-hidden="true"
        className="h-20 w-20 self-center"
      >
        {segments.map(({ row, fraction, start }) => (
          <circle
            key={row.label}
            cx="21"
            cy="21"
            r="15.91549430918954"
            fill="transparent"
            stroke="var(--color-brand)"
            strokeWidth="6"
            strokeDasharray={`${fraction * 100} ${100 - fraction * 100}`}
            strokeDashoffset={25 - start * 100}
          />
        ))}
      </svg>
      <p data-slot="chart-summary" className="sr-only">
        {summary}
      </p>
    </figure>
  );
}
