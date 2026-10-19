/**
 * `ChartFrame` is the canonical chart container used by Dashboard,
 * Analytics & Review, Publishing Center, and Experience.
 *
 * It composes `SectionCard` with a deterministic coordinate-based
 * rendering and a guaranteed textual summary, so the chart is not
 * conveyed by color alone (D-007).
 *
 * Server component: the rendering is a static SVG; no client
 * interactivity is required.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { EmptyChartGrid } from "./empty-chart-grid";

export interface ChartFrameTrendPoint {
  readonly label: string;
  readonly value: number | null;
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
  /** 指标原生单位，播放量默认次；不同单位必须分图。 */
  readonly unit?: string;
  /**
   * Optional `data-shape` value (e.g. `line`, `funnel`). Mirrors the
   * inline-SVG charts so tests can assert the visual shape category
   * uniformly across the page.
   */
  readonly shape?: string;
  readonly emptyMessage?: string;
  readonly emptyAction?: React.ReactNode;
  readonly sourceNote?: string;
}

/** SEMANTIC_BOUNDARY_ALLOW: 仅按真实数值计算坐标域和等距刻度，不作内容判断。 */
function axisDomain(values: number[]) {
  const lower = Math.min(0, ...values), upper = Math.max(0, ...values);
  const rawStep = (upper - lower || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= rawStep) ?? 10) * magnitude;
  const min = Math.floor(lower / step) * step;
  const max = Math.max(Math.ceil(upper / step) * step, min + step);
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step) };
}

export function ChartFrame({ title, summary, trend, description, height = 160, className, testId, slot, shape, unit = "次", emptyMessage="暂无趋势数据",emptyAction,sourceNote }: ChartFrameProps) {
  const valid = trend.filter((point): point is ChartFrameTrendPoint & { value: number } => typeof point.value === "number" && Number.isFinite(point.value));
  const domain = axisDomain(valid.map((point) => point.value));
  const y = (value: number) => 100 - ((value - domain.min) / (domain.max - domain.min)) * 100;
  const x = (index: number) => trend.length === 1 ? 50 : index / (trend.length - 1) * 100;
  const dateTicks = [...new Set([0, Math.round((trend.length - 1) / 3), Math.round((trend.length - 1) * 2 / 3), trend.length - 1])].filter((index) => index >= 0);
  const path = trend.map((point, index) => {
    if (typeof point.value !== "number" || !Number.isFinite(point.value)) return "";
    const previous = trend[index - 1]?.value;
    const command = typeof previous === "number" && Number.isFinite(previous) ? "L" : "M";
    return `${command} ${x(index).toFixed(2)},${y(point.value).toFixed(2)}`;
  }).join(" ");
  return <SectionCard title={title} description={description} className={className}>
    <figure role="figure" aria-label={title} data-slot={slot ?? "chart-frame"} data-shape={shape} data-testid={testId} className="m-0 flex min-w-0 flex-col gap-3">
      <div className="text-xs text-muted-foreground">数值（{unit}）</div>
      {!valid.length ? <><EmptyChartGrid message={emptyMessage} dateLabels={trend.map(point=>point.label)}/>{emptyAction}</> : <>
        <div className="grid min-h-0 min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-2" style={{ height: Math.max(160, height) }}>
          <div data-slot="chart-value-axis" className="relative text-xs text-muted-foreground tabular-nums">
            {domain.ticks.map((tick) => <span key={tick} className="absolute right-0" style={{ top: `${y(tick)}%`, transform: "translateY(-50%)" }}>{tick.toLocaleString("zh-CN", { maximumFractionDigits: 4 })}</span>)}
          </div>
          <svg data-slot="chart-frame-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="block h-full min-h-0 w-full overflow-visible border-l border-border">
            {domain.ticks.map((tick) => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.6" />)}
            <line data-slot="chart-zero-baseline" x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--color-muted-foreground)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {valid.length > 1 && valid.length === trend.length ? <path d={`${path} L 100,${y(0)} L 0,${y(0)} Z`} fill="var(--color-brand)" fillOpacity="0.08" /> : null}
            {valid.length > 1 ? <path d={path} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {trend.map((point, index) => {
              if (typeof point.value !== "number" || !Number.isFinite(point.value)) return null;
              const previous = trend[index - 1]?.value, next = trend[index + 1]?.value;
              const isolated = !(typeof previous === "number" && Number.isFinite(previous)) && !(typeof next === "number" && Number.isFinite(next));
              return isolated ? <line data-slot="chart-data-point" key={index} x1={x(index)} x2={x(index)} y1={y(point.value)} y2={y(point.value)} stroke="var(--color-brand)" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke"><title>{`${point.label}：${point.value.toLocaleString("zh-CN")} ${unit}`}</title></line> : null;
            })}
          </svg>
        </div>
        <div data-slot="chart-date-axis" className="relative ml-[4rem] h-5 text-xs text-muted-foreground tabular-nums">
          {dateTicks.map((index) => <span key={index} title={trend[index]?.label} className="absolute whitespace-nowrap" style={{ left: `${x(index)}%`, transform: index === 0 ? "none" : index === trend.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{trend[index]?.label?.match(/^\d{4}-\d{2}-\d{2}$/)?trend[index]!.label.slice(5).replace("-","/"):trend[index]?.label}</span>)}
        </div>
        <div className="text-right text-xs text-muted-foreground">日期</div>
        {valid.length === 1 ? <p className="text-xs text-muted-foreground">仅有一次有效采集，需多次采集积累趋势。</p> : null}
        <div aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">最高 {Math.max(...valid.map((point) => point.value)).toLocaleString("zh-CN")} · 最低 {Math.min(...valid.map((point) => point.value)).toLocaleString("zh-CN")} {unit}</div>
      </>}
      {sourceNote?<p className="text-xs text-muted-foreground">{sourceNote}</p>:null}
      <figcaption className="sr-only" data-slot="chart-summary"><span data-slot="chart-frame-summary" className="sr-only">{summary}</span></figcaption>
    </figure>
  </SectionCard>;
}
