/**
 * Publishing Workspace page (Task 17 / page-specs §9).
 *
 * The `project-workspace` Header mode landing page for the Publishing
 * stage. Composes:
 *  - a `PublishingTabs` row of page tabs,
 *  - a `PublishingGrid` with three visual regions in the spec order
 *    BasicInformationForm → PlatformPublishingPanel → PreviewRail.
 *
 * The page is a Server Component shell. All interactivity (editable
 * title, tab switching, publishing-option toggles, platform selection
 * and the Confirm Publish lifecycle transition) lives in the Client
 * island `PublishingInteractiveRegion`
 * (`./publishing-interactive-region.tsx`), consistent with the existing
 * islands pattern (assets / settings / search / production).
 *
 * Confirm Publish is fixture-only — it transitions the publication's
 * local lifecycle (draft → ready / scheduled) and reflects it in the UI.
 * There is no `fetch` and no real network publication.
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
import { buildPublishingViewModel } from "@/fixtures/selectors";
import type { PublishingViewModel } from "@/types/view-models";
import {
  PublishingInteractiveRegion,
  type CalendarWiring,
  type PublishingRightRail,
  type PublishingWiring,
} from "./publishing-interactive-region";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PublishingWorkspacePageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the publishing selector. */
  readonly viewModel?: PublishingViewModel;
  /** Server-resolved publishing wiring (Module 10 Step 5). Optional → local-only. */
  readonly wiring?: PublishingWiring;
  /**
   * Server-resolved 内容日历 wiring (GAP-PUBW-1): the active account + a
   * deterministic per-cell base instant. Absent → the calendar stays inert
   * (decorative). Threaded straight to the interactive island.
   */
  readonly calendarWiring?: CalendarWiring;
  /**
   * Server-resolved 右栏真来源 (GAP-PUBW-1): per-platform metric cards / comparison
   * rows / preview stats aggregated from analytics snapshots. Absent → the rail
   * renders honest 暂无指标 empty states instead of fabricated numbers.
   */
  readonly rightRail?: PublishingRightRail;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PublishingWorkspacePage({
  projectId,
  viewModel,
  wiring,
  calendarWiring,
  rightRail,
}: PublishingWorkspacePageProps) {
  const vm = viewModel ?? buildPublishingViewModel(projectId);
  const isEmpty = vm.platforms.length === 0 && vm.tabs.length === 0;
  const state = resolvePageState(vm, isEmpty);
  return (
    <main
      data-app="creatoros"
      data-page="publishing"
      data-project-id={vm.projectId}
      data-page-state={state}
      className="flex flex-col gap-2"
    >
      {state === "loading" ? (
        <LoadingState label="正在加载发布工作台…" rows={5} />
      ) : state === "error" ? (
        <ErrorState error={vm.error} />
      ) : state === "empty" ? (
        <EmptyState
          title="暂无可发布内容"
          description="该项目尚未生成可发布的内容或平台配置。"
        />
      ) : (
        <PublishingInteractiveRegion
          viewModel={vm}
          wiring={wiring}
          calendarWiring={calendarWiring}
          rightRail={rightRail}
        />
      )}
    </main>
  );
}
