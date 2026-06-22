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
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProductionWorkspacePage({
  projectId,
  viewModel,
  wiring,
  assetLibraryTotal,
}: ProductionWorkspacePageProps) {
  const vm = viewModel ?? buildProductionViewModel(projectId);
  const isEmpty =
    vm.scriptLines.length === 0 &&
    vm.assets.length === 0 &&
    vm.timeline.length === 0;
  const state = resolvePageState(vm, isEmpty);
  return (
    <main
      data-app="creatoros"
      data-page="production"
      data-project-id={vm.projectId}
      data-page-state={state}
      className="flex flex-col gap-3"
    >
      {state === "loading" ? (
        <LoadingState label="正在加载制作工作台…" rows={5} />
      ) : state === "error" ? (
        <ErrorState error={vm.error} />
      ) : state === "empty" ? (
        <EmptyState
          title="暂无制作内容"
          description="该项目尚未进入制作阶段或没有可用素材。"
        />
      ) : (
        <ProductionInteractiveRegion
          viewModel={vm}
          wiring={wiring}
          assetLibraryTotal={assetLibraryTotal}
        />
      )}
    </main>
  );
}
