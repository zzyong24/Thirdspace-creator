"use client";

/**
 * `ConversionFunnelChart` — the转化漏斗 visual for the Analytics & Review page,
 * rendered with an ECharts `funnel` series (T-035b, replacing the inline-SVG
 * polygon funnel).
 *
 * The data is REAL (task §2): 曝光 → 点击 → 播放 → 互动 → 转化, derived in the
 * view-model from the project's真 plays / interactions / favorites. This
 * component is purely presentational — it renders the funnel from the passed
 * stages and does not fabricate any value.
 *
 * Each stage takes a distinct chart token so the descending funnel is legible;
 * a tooltip shows the raw count. The wrapping `<article data-slot="conversion-
 * funnel">` (with the stage list + sr-only summary) stays in the interactive
 * region, so this component only owns the canvas. SSR-safe via client-only
 * `EChart`.
 */

import * as React from "react";
import type { EChartsOption } from "echarts";

import { EChart, useChartTokens } from "@/components/analytics/echarts-base";

export interface FunnelStage {
  readonly label: string;
  readonly value: number;
}

export interface ConversionFunnelChartProps {
  readonly data: ReadonlyArray<FunnelStage>;
  readonly testId?: string;
}

export function ConversionFunnelChart({
  data,
  testId = "conversion-funnel-chart",
}: ConversionFunnelChartProps) {
  const tokens = useChartTokens();

  const option = React.useMemo<EChartsOption>(() => {
    const max = Math.max(...data.map((d) => d.value), 1);
    return {
      tooltip: {
        trigger: "item" as const,
        backgroundColor: tokens.surface,
        borderColor: tokens.border,
        borderWidth: 1,
        textStyle: { color: tokens.foreground, fontSize: 12 },
        formatter: (p) => {
          const one = Array.isArray(p) ? p[0] : p;
          const v = typeof one?.value === "number" ? one.value : 0;
          return `${one?.name ?? ""}<br/>${v.toLocaleString("zh-CN")}`;
        },
      },
      series: [
        {
          type: "funnel" as const,
          left: "4%",
          right: "4%",
          top: 8,
          bottom: 8,
          min: 0,
          max,
          minSize: "24%",
          maxSize: "100%",
          sort: "descending" as const,
          gap: 2,
          funnelAlign: "center" as const,
          label: {
            show: true,
            position: "inside" as const,
            color: "#ffffff",
            fontSize: 11,
            // "{b}" = the data item's name (曝光 / 点击 / …). Built-in template →
            // no callback typing needed.
            formatter: "{b}",
          },
          labelLine: { show: false },
          itemStyle: {
            borderColor: tokens.surface,
            borderWidth: 1,
          },
          data: data.map((d, i) => ({
            name: d.label,
            value: d.value,
            itemStyle: { color: tokens.chart[i % tokens.chart.length] },
          })),
        },
      ],
    };
  }, [data, tokens]);

  return (
    <EChart
      option={option}
      testId={testId}
      className="h-40 w-full"
      style={{ height: "10rem", width: "100%" }}
    />
  );
}
