/**
 * 发布中心主视图（T-599）。
 *
 * 项目列表拥有作品库存，发布中心只回答两个问题：
 * 1. 过去发布和未来排期在时间上如何分布；
 * 2. 已发布内容的真实表现如何。
 *
 * 因此页面只保留“左月历 / 右表现”的主从布局。月历由 route 的 batch
 * composition 作为真实 React 节点传入；本 feature 不重新取数，也不保留 fixture
 * 回退。月历与表现各自处理 loading/error/empty，任何一侧失败都不会遮住另一侧。
 */

import * as React from "react";

import { ErrorState, LoadingState } from "@/components/state/page-state";
import type {
  BasePageViewModel,
  MetricCard as MetricCardVm,
  ViewModelError,
} from "@/types/view-models";
import {
  PublishingCenterSummaryRail,
  PublishingCenterTopContent,
} from "./publishing-center-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PublishingCenterPageProps {
  /** 真实表现投影；缺省只用于接线期间的诚实空投影，不读取 fixture。 */
  readonly viewModel?: PublishingCenterViewModel;
  /**
   * route 组合出的真实月历。它可以自行渲染 ready/error/empty；
   * 未接线时显示明确错误，不用旧“打开日历”入口兜底。
   */
  readonly calendar?: React.ReactNode;
}

export interface PublishingCenterViewModel extends BasePageViewModel {
  readonly kind: "publishing-center";
  readonly contentTypeTabs: ReadonlyArray<ContentTypeTab>;
  readonly publications: ReadonlyArray<PublicationRow>;
  readonly metrics: ReadonlyArray<MetricCardVm>;
  readonly platformComparison: ReadonlyArray<PlatformShare>;
  readonly trend: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  readonly topContent: ReadonlyArray<TopContentRow>;
  readonly pagination: { readonly currentPage: number; readonly totalPages: number };
}

export interface ContentTypeTab {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

/** Tab/content-type key used to filter the publication table. */
export type PublicationContentType = "video" | "image" | "audio";

export interface PublicationRow {
  readonly id: string;
  readonly contentTitle: string;
  /** The owning project's id, when resolvable — drives the row 查看 deep link (D3). */
  readonly projectId?: string;
  readonly projectTitle: string;
  readonly contentType: PublicationContentType;
  readonly platform: string;
  readonly platformLabel: string;
  readonly publishedAt: string;
  readonly publishedAtLabel: string;
  readonly status: "published" | "scheduled" | "draft" | "removed";
  readonly statusLabel: string;
  // [T-073] 平台侧已隐藏(抖音端「仅自己可见/已隐藏」,publication.hiddenAt 非空)。
  //   列表默认过滤 hidden 行,可切「显示已隐藏」;显示时行上带「已隐藏」徽标。
  readonly hidden: boolean;
  readonly views: string;
  readonly engagementLabel: string;
  readonly engagementTone: "positive" | "neutral" | "warning";
  readonly thumbnailToken: string;
  // [T-078] 真封面(revision.coverAssetId,采集回填/用户手选);null/缺省 → 渐变占位。
  readonly coverAssetId?: string | null;
}

export interface PlatformShare {
  readonly platform: string;
  readonly platformLabel: string;
  readonly share: number;
  readonly views: string;
}

export interface TopContentRow {
  readonly id: string;
  readonly title: string;
  readonly platform: string;
  readonly platformLabel: string;
  // [T-082] 真封面(revision.coverAssetId,T-078 同款渲染链);null/缺省 → 渐变占位。
  readonly coverAssetId?: string | null;
  readonly views: string;
  readonly engagement: string;
}

const EMPTY_VIEW_MODEL: PublishingCenterViewModel = {
  scenario: "default",
  kind: "publishing-center",
  loading: false,
  error: null,
  contentTypeTabs: [],
  publications: [],
  metrics: [],
  platformComparison: [],
  trend: [],
  topContent: [],
  pagination: { currentPage: 1, totalPages: 1 },
};

const CALENDAR_NOT_COMPOSED: ViewModelError = {
  code: "calendar_unavailable",
  message: "内容日历暂时不可用，请稍后重试。",
};

export function PublishingCenterPage({
  viewModel,
  calendar,
}: PublishingCenterPageProps = {}) {
  const vm = viewModel ?? EMPTY_VIEW_MODEL;
  const performanceState =
    vm.loading || vm.scenario === "loading"
      ? "loading"
      : vm.error || vm.scenario === "error"
        ? "error"
        : "ready";

  return (
    <main
      data-app="creatoros"
      data-page="publishing-center"
      data-publishing-center-id="publishing-center-root"
      data-page-state={performanceState}
      className="min-w-0"
    >
      <div
        data-slot="publishing-center-layout"
        data-layout="calendar-70-performance-30"
        className="flex min-w-0 flex-col gap-card-gap"
      >
        <div
          data-slot="publishing-center-primary-row"
          className="grid min-w-0 grid-cols-1 items-start gap-card-gap lg:grid-cols-[minmax(0,7fr)_minmax(17rem,3fr)]"
        >
          <section
            data-slot="publishing-calendar-region"
            aria-label="内容日历"
            className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-sm"
          >
            {calendar ?? <ErrorState error={CALENDAR_NOT_COMPOSED} />}
          </section>

          <section
            data-slot="publishing-performance-region"
            aria-label="发布表现"
            className="min-w-0"
          >
            {performanceState === "loading" ? (
              <LoadingState label="正在加载发布表现…" rows={4} />
            ) : performanceState === "error" ? (
              <ErrorState error={vm.error} />
            ) : (
              <PublishingCenterSummaryRail viewModel={{ metrics: vm.metrics, platformComparison: vm.platformComparison, trend: vm.trend }} />
            )}
          </section>
        </div>

        <section
          data-slot="publishing-center-details"
          aria-label="热门内容"
          className="min-w-0"
        >
          {performanceState === "loading" ? (
            <LoadingState label="正在加载热门内容…" rows={2} />
          ) : performanceState === "error" ? (
            null
          ) : (
            <PublishingCenterTopContent viewModel={{ topContent: vm.topContent }} />
          )}
        </section>
      </div>
    </main>
  );
}
