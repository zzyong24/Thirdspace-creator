"use client";

/**
 * 发布中心右侧真实表现栏（T-599）。
 *
 * 这里不再拥有作品筛选、搜索、历史长表或分页；这些都属于项目库存的重复呈现。
 * 组件只消费 route 已组合好的真实表现投影，并对空数组显示诚实空态。
 */

import * as React from "react";

import { ChartFrame } from "@/components/analytics/chart-frame";
import { MetricCard } from "@/components/project/metric-card";
import { SectionCard } from "@/components/project/section-card";
import { PlatformIcon } from "@/components/publishing/platform-icon";
import { CoverThumb } from "@/components/resources/cover-thumb";
import type { MetricCard as MetricCardVm } from "@/types/view-models";
import type {
  PlatformShare,
  PublishingCenterViewModel,
  TopContentRow,
} from "./publishing-center-page";

export function PublishingCenterInteractiveRegion({
  viewModel,
}: {
  readonly viewModel: PublishingCenterViewModel;
}) {
  return (
    <>
      <PublishingCenterSummaryRail viewModel={viewModel} />
      <PublishingCenterTopContent viewModel={viewModel} />
    </>
  );
}

export function PublishingCenterSummaryRail({
  viewModel,
}: {
  readonly viewModel: PublishingCenterViewModel;
}) {
  return (
    <aside
      data-slot="analytics-rail"
      aria-label="发布数据"
      className="flex min-w-0 flex-col gap-card-gap"
    >
      <PublishingMetrics metrics={viewModel.metrics} />
      <PlatformComparisonChart shares={viewModel.platformComparison} />
      <TrendChart trend={viewModel.trend} />
    </aside>
  );
}

export function PublishingCenterTopContent({
  viewModel,
}: {
  readonly viewModel: PublishingCenterViewModel;
}) {
  return <TopContentList items={viewModel.topContent} />;
}

function PublishingMetrics({
  metrics,
}: {
  metrics: ReadonlyArray<MetricCardVm>;
}) {
  return (
    <section
      data-slot="publishing-metrics"
      aria-label="发布概览"
      className="grid grid-cols-2 gap-card-gap"
    >
      {metrics.length > 0 ? (
        metrics.map((metric) => (
          <MetricCard
            key={metric.id}
            id={metric.id}
            label={metric.label}
            value={metric.value}
            delta={metric.delta}
            trend={metric.trend}
            tone={metric.tone}
          />
        ))
      ) : (
        <p
          data-slot="publishing-metrics-empty"
          className="col-span-2 rounded-card border border-border bg-surface py-6 text-center text-xs text-muted-foreground"
        >
          暂无发布数据
        </p>
      )}
    </section>
  );
}

function PlatformComparisonChart({
  shares,
}: {
  shares: ReadonlyArray<PlatformShare>;
}) {
  const total = shares.reduce((acc, row) => acc + row.share, 0);
  if (shares.length === 0 || total <= 0) {
    return (
      <SectionCard title="平台对比" description="按平台播放量占比">
        <p
          data-slot="platform-comparison-empty"
          className="py-6 text-center text-xs text-muted-foreground"
        >
          暂无数据
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="平台对比" description="按平台播放量占比">
      <div data-slot="platform-comparison-chart" className="flex flex-col gap-2">
        <ul
          data-slot="platform-comparison-list"
          className="flex flex-col gap-2"
          aria-label="平台对比数据"
        >
          {shares.map((row) => {
            const pct = (row.share / total) * 100;
            return (
              <li
                key={row.platform}
                data-slot="platform-comparison-row"
                data-platform={row.platform}
                data-share={row.share.toFixed(2)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PlatformIcon platform={row.platform} size="sm" />
                  <span className="truncate text-foreground">
                    {row.platformLabel}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div
                    aria-hidden="true"
                    className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-subtle"
                  >
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${pct.toFixed(1)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono tabular-nums text-muted-foreground">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <p data-slot="chart-summary" className="sr-only">
          平台对比：
          {shares
            .map(
              (row) =>
                `${row.platformLabel} ${((row.share / total) * 100).toFixed(0)}%`,
            )
            .join("、")}
          。
        </p>
      </div>
    </SectionCard>
  );
}

function TrendChart({
  trend,
}: {
  trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
}) {
  if (trend.length === 0) {
    return (
      <SectionCard title="发布趋势" description="按日播放量">
        <p
          data-slot="trend-chart-empty"
          className="py-6 text-center text-xs text-muted-foreground"
        >
          暂无数据
        </p>
      </SectionCard>
    );
  }

  if (trend.length === 1) {
    const only = trend[0]!;
    return (
      <SectionCard title="发布趋势" description="至少两个采集日后显示变化">
        <div
          data-slot="trend-chart-single-point"
          className="flex items-end justify-between gap-4 py-2"
        >
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {only.value.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">{only.label}</span>
          </div>
          <p className="max-w-40 text-right text-xs leading-relaxed text-muted-foreground">
            当前只有 1 个采集日，暂不绘制容易误导的趋势线。
          </p>
        </div>
      </SectionCard>
    );
  }

  const first = trend[0];
  const last = trend[trend.length - 1];
  const direction =
    (last?.value ?? 0) > (first?.value ?? 0)
      ? "上升"
      : (last?.value ?? 0) < (first?.value ?? 0)
        ? "下降"
        : "持平";
  const summary = `发布趋势：${first?.label ?? ""} ${first?.value.toLocaleString() ?? ""}，${last?.label ?? ""} ${last?.value.toLocaleString() ?? ""}，整体${direction}。`;

  return (
    <ChartFrame
      title="发布趋势"
      description="按日播放量"
      summary={summary}
      trend={trend}
      slot="trend-chart"
      shape="line"
      testId="publishing-trend-chart"
    />
  );
}

function TopContentList({
  items,
}: {
  items: ReadonlyArray<TopContentRow>;
}) {
  if (items.length === 0) {
    return (
      <SectionCard title="热门内容" description="播放量最高">
        <p
          data-slot="top-content-empty"
          className="py-6 text-center text-xs text-muted-foreground"
        >
          暂无数据
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="热门内容" description="播放量最高">
      <ul
        data-slot="top-content-list"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="热门内容列表"
      >
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="top-content-row"
            data-top-content-id={item.id}
            className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm"
          >
            <CoverThumb
              assetId={item.coverAssetId ?? null}
              alt={item.title}
              className="h-9 w-16 shrink-0 rounded-md border border-border bg-surface object-cover"
              fallback={
                <span
                  aria-hidden="true"
                  className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-brand-soft text-[10px] font-medium text-brand"
                >
                  16:9
                </span>
              }
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-foreground">{item.title}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[item.platformLabel, item.views, item.engagement]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
