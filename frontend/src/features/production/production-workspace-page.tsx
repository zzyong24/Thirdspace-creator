/**
 * Production Workspace page (Task 16 / page-specs §8).
 *
 * The `project-workspace` Header mode landing page for the Production
 * stage. Composes:
 *  - a `ProductionModeSelector` with three production mode cards
 *    (真人口播 / 知识演示 / AI 数字人) in the locked spec order,
 *  - a `ProductionGrid` with four visual regions in the spec order
 *    RecordingScriptPanel → AssetLibraryPanel (with category tabs and
 *    a 3-column thumbnail grid) → PreviewPanel → SettingsRail
 *    (RecordingSettings → SubtitleSettings → ExportSettings, the
 *    export button lives at the bottom of the SettingsRail — D-016
 *    locks it from migrating to the timeline region),
 *  - a `TimelinePanel` with a single horizontal track of
 *    TimelineSegmentCard[] (NOT a multi-track NLE layout).
 *
 * The page is a Server Component shell. All interactivity (mode
 * selection, asset category tabs, settings toggles, preview play/pause,
 * timeline select/add, export action) lives in the Client island
 * `ProductionInteractiveRegion` (`./production-interactive-region.tsx`),
 * consistent with the existing islands pattern (assets / settings /
 * search).
 *
 * When the ViewModel envelope signals `loading` / `error` / `empty`, the
 * page renders the shared page-state placeholders for the main content
 * region instead of the interactive grid. The default state renders the
 * island and is DOM-equivalent to the previous server-only render.
 */

import * as React from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  resolvePageState,
} from "@/components/state/page-state";
import { buildProductionViewModel } from "@/fixtures/selectors";
import type { ProductionViewModel } from "@/types/view-models";
import {
  ProductionInteractiveRegion,
  type ProductionWiring,
  type ProductionMultimodalConfig,
} from "./production-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProductionWorkspacePageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: ProductionViewModel;
  /**
   * Resolved by the (async) route via `outputs.production.get` — the
   * `{ outputId, productionId }` the interactive island threads into its
   * needs-backend / wired-local→backend contract ops (Module 09 Step 5). When
   * absent the island degrades to local-only behavior, so the page stays a
   * deterministic sync Server Component and the fixture render is unchanged.
   */
  readonly wiring?: ProductionWiring;
  /**
   * REAL whole-library asset count (`assets.list`) resolved by the route via
   * `countAssetLibrary`, threaded to the island for the 素材库「全部」stat
   * (GAP-PRD-1 AC1 — replaces the old fabricated formula). Optional: when absent
   * the island degrades to the matched-asset count, never a made-up number.
   */
  readonly assetLibraryTotal?: number;
  /**
   * 项目主 output 的 aspectRatio(路由从 `projects.outputs.list` 读)—— 驱动 L5 录制页
   * AI 生成区的 `[gate-F3]` 默认横竖屏(竖屏优先)。Optional:absent → AI 生成区默认竖屏。
   */
  readonly outputAspectRatio?: string;
  /**
   * 多模态(文生图/文生视频)模型是否已配 —— 路由读 `settings.models.list` 的 hasSecret 判。
   * 驱动 AI 生成区「未配禁用 + 引导去设置」。Optional:absent(测试/fixture)→ 视为未配。
   */
  readonly multimodalConfig?: ProductionMultimodalConfig;
  /**
   * [T-053 断点②] 项目还没有 ContentOutput(wiring 解析不出)时,route 传入的
   * 「开始制作」CTA(StartProductionIsland)。空态从死文案变成可行动入口 ——
   * 产出创建后 refresh,wiring 就位,工作台接通。
   */
  readonly startProductionSlot?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProductionWorkspacePage({
  projectId,
  viewModel,
  wiring,
  assetLibraryTotal,
  outputAspectRatio,
  multimodalConfig,
  startProductionSlot,
}: ProductionWorkspacePageProps) {
  const vm = viewModel ?? buildProductionViewModel(projectId);
  const isEmpty =
    vm.scriptLines.length === 0 &&
    vm.assets.length === 0 &&
    vm.timeline.length === 0;
  const state = resolvePageState(vm, isEmpty);
  // [T-053 断点②] 空态门只挡「还没有产出」的项目(wiring 缺失):有产出/production
  // 就渲染工作台,由各区自己的空态引导(旧逻辑 vm 数据空 = 整页 EmptyState,把刚建完
  // 产出的项目也挡在录制工作台外 —— 建了产出仍进不去,死锁第二层)。
  const showEmptyGate = state === "empty" && !wiring;
  return (
    <main
      data-app="creatoros"
      data-page="production"
      data-project-id={vm.projectId}
      data-page-state={showEmptyGate ? "empty" : state === "empty" ? "default" : state}
      className="flex flex-col gap-3"
    >
      {state === "loading" ? (
        <LoadingState label="正在加载制作工作台…" rows={5} />
      ) : state === "error" ? (
        <ErrorState error={vm.error} />
      ) : showEmptyGate ? (
        <>
          <EmptyState
            title="暂无制作内容"
            description="该项目还没有产出内容。"
          />
          {startProductionSlot}
        </>
      ) : (
        <ProductionInteractiveRegion
          viewModel={vm}
          wiring={wiring}
          assetLibraryTotal={assetLibraryTotal}
          outputAspectRatio={outputAspectRatio}
          multimodalConfig={multimodalConfig}
        />
      )}
    </main>
  );
}
