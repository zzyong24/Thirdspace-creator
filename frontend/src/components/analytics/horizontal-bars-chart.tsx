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
import { EmptyChartGrid } from "./empty-chart-grid";

export interface HorizontalBarsChartProps {
  readonly slot: string;
  readonly ariaLabel?: string;
  readonly shape: string;
  readonly data: ReadonlyArray<ChartDatum>;
  readonly summary: string;
  readonly unit?: string;
  readonly emptyMessage?: string;
}

export function HorizontalBarsChart({ slot, ariaLabel, shape, data, summary, unit = "次",emptyMessage="暂无比较数据" }: HorizontalBarsChartProps) {
  const rows = data.filter((row) => typeof row.value === "number" && Number.isFinite(row.value) && row.value >= 0);
  // SEMANTIC_BOUNDARY_ALLOW: 只算共同零起点坐标，不作作品选择或质量判断。
  const rawStep = (Math.max(...rows.map((row) => row.value), 1)) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 2.5, 3, 4, 5, 6, 7.5, 10].find((n) => n * magnitude >= rawStep) ?? 10) * magnitude;
  const max = step * 4;
  return <figure role="figure" data-slot={slot} data-shape={shape} aria-label={ariaLabel ?? slot} className="m-0 flex min-w-0 flex-col gap-3">
    <div className="text-xs text-muted-foreground">数值（{unit}）</div>
    {!data.length ? <EmptyChartGrid message={emptyMessage}/> : <>
      <div className="flex flex-col gap-3">
        {data.map((row, index) => {
          const measured = typeof row.value === "number" && Number.isFinite(row.value) && row.value >= 0;
          return <div key={`${row.label}-${index}`} className="min-w-0">
            <div className="mb-1 flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{row.label}</span><span className="shrink-0 tabular-nums">{measured ? `${row.value.toLocaleString("zh-CN")} ${unit}` : "—"}</span></div>
            {measured ? <svg data-slot={`${slot}-svg`} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" className="h-5 w-full overflow-visible">
              <rect width="100" height="10" fill="var(--color-brand-soft)" rx="1" />
              {[0, 1, 2, 3, 4].map((tick) => <line key={tick} x1={tick * 25} x2={tick * 25} y1="0" y2="10" stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
              <rect width={row.value / max * 100} height="10" fill="var(--color-brand)" rx="1" />
            </svg> : null}
          </div>;
        })}
      </div>
      {rows.length ? <div data-slot={`${slot}-axis`} className="relative h-6 border-t border-border pt-2 text-xs text-muted-foreground tabular-nums">{[0, 1, 2, 3, 4].map((tick) => <span key={tick} className="absolute whitespace-nowrap" style={{ left: `${tick * 25}%`, transform: tick === 0 ? "none" : tick === 4 ? "translateX(-100%)" : "translateX(-50%)" }}>{(tick * step).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}</span>)}</div> : <p className="text-sm text-muted-foreground">暂无比较数据</p>}
    </>}
    <p data-slot="chart-summary" className="sr-only">{summary}</p>
  </figure>;
}
