/**
 * Publishing Center page (Task 21 / page-specs §13).
 *
 * The `/publishing` global resource-center landing page. Composes, in
 * the spec order:
 *
 *   PublishingCenterPage
 *   ├── ContentTypeTabs            (locked order: 全部 / 视频 / 图文 / 音频)
 *   ├── Two-column grid
 *   │   ├── Left stack
 *   │   │   ├── PublishingToolbar  (search + filter affordances)
 *   │   │   ├── BatchOperationBar  (全选 + 批量发布/下架/修改时间)
 *   │   │   └── PublicationTable   (7 columns: 内容 / 项目 / 平台 /
 *   │   │                             发布时间 / 状态 / 表现 / 操作)
 *   │   │       └── PublicationPerformanceRow[] (each row keeps a platform
 *   │   │                                    icon and a content thumbnail)
 *   │   └── AnalyticsRail          (locked order: PublishingMetrics →
 *   │                                PlatformComparisonChart →
 *   │                                TrendChart → TopContentList)
 *   └── Pagination
 *
 * Layout invariants (page-specs §13, D-003):
 *  - The page is a global resource-center route — distinct from the
 *    per-project Publishing Workspace at `/projects/[id]/publishing`
 *    (page-specs §13 "禁止改变": "不与 Publishing Workspace 合并").
 *  - Header is in `global` mode with page title "发布中心" and
 *    description "已发布内容、表现与排期" (configured by
 *    `(creator)/shell-router.tsx`).
 *  - The shared Sidebar uses the approved `assistant` contextual-card
 *    variant (D-003). The page itself does NOT render the global
 *    Sidebar — that lives in `(creator)/layout.tsx`.
 *  - Publication table is a 7-column table — NOT a card waterfall
 *    (page-specs §13 "禁止改变": "不改成卡片瀑布流").
 *  - No content editor entry is added (page-specs §13 "禁止改变":
 *    "不新增内容编辑入口").
 *  - Platform icons and content thumbnails are preserved.
 *  - No new product structure, no fixture mutation, no Date.now /
 *    Math.random / network access.
 *  - BatchOperationBar is placed between toolbar and table, aligned
 *    with the design reference.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group.
 */

import Link from "next/link";
import * as React from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  resolvePageState,
} from "@/components/state/page-state";
import { buildPublishingCenterViewModel } from "@/fixtures/selectors";
import type {
  BasePageViewModel,
  MetricCard as MetricCardVm,
} from "@/types/view-models";
import { PublishingCenterInteractiveRegion } from "./publishing-center-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PublishingCenterPageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset. The
   * page does not consume network or runtime data — it pulls everything
   * from the fixed fixtures (D-010) so SSR output is deterministic.
   */
  readonly viewModel?: PublishingCenterViewModel;
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
  readonly views: string;
  readonly engagement: string;
}

// ---------------------------------------------------------------------------
// Page (Server Component shell)
//
// The page renders the shared page-state placeholders when the ViewModel
// envelope signals loading / error / empty, and otherwise mounts the
// Client island (`PublishingCenterInteractiveRegion`) which owns the
// wired tabs / search / filters / batch-select / pagination / row
// actions. The default-state DOM is equivalent to the previous
// server-only render so the visual baseline holds.
// ---------------------------------------------------------------------------

export function PublishingCenterPage({
  viewModel,
}: PublishingCenterPageProps = {}) {
  const vm = viewModel ?? buildPublishingCenterViewModel();
  const isEmpty = vm.publications.length === 0;
  const state = resolvePageState(vm, isEmpty);
  return (
    <main
      data-app="creatoros"
      data-page="publishing-center"
      data-publishing-center-id="publishing-center-root"
      data-page-state={state}
      className="flex flex-col gap-card-gap"
    >
      {/* [T-052 裁决⑤] 内容日历并入发布中心:此前 /calendar 全站无入口(孤儿页,
          只能手敲 URL)。发布节奏/排期属发布中心域,入口挂这里。 */}
      <div
        data-slot="publishing-center-calendar-entry"
        className="flex items-center justify-between rounded-card border border-border bg-surface-subtle px-3.5 py-2.5"
      >
        <span className="text-sm text-muted-foreground">
          内容日历 · 发布节奏与达成率
        </span>
        <Link
          href="/calendar"
          className="text-sm font-medium text-brand hover:underline"
        >
          打开日历 →
        </Link>
      </div>
      {state === "loading" ? (
        <LoadingState label="正在加载发布中心…" rows={6} />
      ) : state === "error" ? (
        <ErrorState error={vm.error} />
      ) : state === "empty" ? (
        <EmptyState
          title="暂无发布内容"
          description="发布内容后即可在此查看表现与排期。"
        />
      ) : (
        <PublishingCenterInteractiveRegion viewModel={vm} />
      )}
    </main>
  );
}
