/**
 * Script Workspace page (Task 15 / page-specs §7, decision-log D-008).
 *
 * The `project-workspace` Header mode landing page for the Script
 * stage. Composes:
 *  - a ScriptTabs strip with four locked tabs
 *    主脚本 / 章节 / 引用 / 摘要,
 *  - a Main column with a single `RichTextEditor` shell (a static
 *    editor — toolbar + document + status bar — per D-008) and a
 *    horizontal `VersionHistoryStrip` below the editor,
 *  - a right rail with OutlineStructureCard, AIWritingSuggestionsCard
 *    and GoldenQuotesCard in that fixed order.
 *
 * Layout invariants (locked by the page spec):
 *  - left-wide / right-narrow two-column grid,
 *  - exactly four Script Tabs in the locked spec order,
 *  - the editor toolbar/document/status bar live inside ONE shared
 *    shell, with the status bar BELOW the document,
 *  - the version history lives BELOW the editor (NOT pushed onto a
 *    separate page),
 *  - the toolbar exposes role="toolbar" with accessible `aria-pressed`
 *    state on every control — but no actual rich-text editor
 *    framework is wired (D-008),
 *  - the document surfaces section headings, time codes and a
 *    purple emphasis span for the golden-quote section,
 *  - right rail order OutlineStructure → AI Suggestions → Golden Quotes.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted once
 * for the whole route group. The page just provides the content slot.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { PageTabs } from "@/components/navigation/page-tabs";
import { buildScriptViewModel } from "@/fixtures/selectors";
import { ScriptInteractiveRegion } from "./script-interactive-region";
import { ScriptDraftIsland } from "./script-draft-island";
import type {
  ScriptViewModel,
} from "@/types/view-models";
import type { ProjectStageName } from "@/types/domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScriptWorkspacePageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: ScriptViewModel;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ScriptWorkspacePage({
  projectId,
  viewModel,
}: ScriptWorkspacePageProps) {
  const vm = viewModel ?? buildScriptViewModel(projectId);
  return (
    <main
      data-app="creatoros"
      data-page="script"
      data-project-id={vm.projectId}
      className="flex flex-col gap-section-gap"
    >
      <ScriptTabs tabs={vm.tabs} />
      <div
        data-slot="script-grid"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_400px]"
      >
        <div
          data-slot="script-main-column"
          className="flex flex-col gap-card-gap"
        >
          <ScriptInteractiveRegion
            sections={vm.sections}
            toolbarState={vm.toolbarState}
          />
          <VersionHistoryStrip versions={vm.versions} />
        </div>
        <div
          data-slot="script-right-rail"
          className="flex flex-col gap-card-gap"
        >
          {vm.scriptArtifactId ? (
            <ScriptDraftIsland
              projectId={vm.projectId}
              artifactId={vm.scriptArtifactId}
              topic={vm.topic}
            />
          ) : null}
          <OutlineStructureCard items={vm.outline} />
          <AIWritingSuggestionsCard items={vm.aiSuggestions} />
          <GoldenQuotesCard items={vm.goldenQuotes} />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ScriptTabs
// ---------------------------------------------------------------------------

function ScriptTabs({
  tabs,
}: {
  tabs: ScriptViewModel["tabs"];
}) {
  return (
    <div data-slot="script-tabs">
      <div data-slot="page-tabs">
        <PageTabs
          tabs={tabs}
          defaultValue={tabs[0]?.id}
          ariaLabel="脚本子页签"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VersionHistoryStrip (horizontal cards BELOW the editor)
// ---------------------------------------------------------------------------

function VersionHistoryStrip({
  versions,
}: {
  versions: ScriptViewModel["versions"];
}) {
  return (
    <div
      data-slot="version-history-strip"
      className="flex flex-row gap-3 overflow-x-auto"
    >
      <SectionCard
        title="版本记录"
        description="横向排列在编辑器下方,不进入独立页面"
        className="min-w-0 flex-1"
      >
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无版本记录。</p>
        ) : (
          <ul
            data-slot="version-history-list"
            className="flex flex-row gap-3"
            aria-label="脚本版本记录"
          >
            {versions.map((version) => (
              <li
                key={version.id}
                data-slot="version-history-card"
                data-version-id={version.id}
                className="flex min-w-40 flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-1.5"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {version.label}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {version.createdAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right rail cards
// ---------------------------------------------------------------------------

function OutlineStructureCard({
  items,
}: {
  items: ScriptViewModel["outline"];
}) {
  return (
    <div data-slot="outline-structure-card">
      <SectionCard
        title="大纲结构"
        description={`${items.length} 个章节`}
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无大纲。</p>
        ) : (
          <ol
            data-slot="outline-list"
            className="flex flex-col gap-1.5"
            aria-label="大纲结构"
          >
            {items
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((item, index) => (
                <li
                  key={item.id}
                  data-slot="outline-row"
                  data-outline-id={item.id}
                  className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1.5"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand tabular-nums">
                    {index + 1}
                  </span>
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.heading}
                  </span>
                </li>
              ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

function AIWritingSuggestionsCard({
  items,
}: {
  items: ScriptViewModel["aiSuggestions"];
}) {
  return (
    <div data-slot="ai-writing-suggestions-card">
      <SectionCard
        title="AI 写作建议"
        description={`${items.length} 条建议`}
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无 AI 建议。</p>
        ) : (
          <ul
            data-slot="ai-suggestion-list"
            className="flex flex-col gap-1.5"
            aria-label="AI 写作建议"
          >
            {items.map((item, index) => {
              const tone = aiSuggestionTone(index);
              return (
                <li
                  key={item.id}
                  data-slot="ai-suggestion-row"
                  data-suggestion-id={item.id}
                  data-tone={tone.name}
                  className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    <span
                      data-slot="ai-suggestion-badge"
                      className={`ml-auto inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-medium ${tone.className}`}
                    >
                      {tone.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.body}</p>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function aiSuggestionTone(index: number): {
  readonly name: string;
  readonly label: string;
  readonly className: string;
} {
  // Cycle through three tones so the right-rail card matches the
  // design's three-state pattern (suggest / pending / accepted).
  const tones = [
    {
      name: "suggested",
      label: "建议",
      className: "bg-brand-soft text-brand",
    },
    {
      name: "accepted",
      label: "已采纳",
      className: "bg-success/15 text-success",
    },
    {
      name: "pending",
      label: "待评估",
      className: "bg-warning/15 text-warning",
    },
  ] as const;
  return tones[index % tones.length];
}

function GoldenQuotesCard({
  items,
}: {
  items: ScriptViewModel["goldenQuotes"];
}) {
  return (
    <div data-slot="golden-quotes-card">
      <SectionCard title="金句" description={`${items.length} 条候选`}>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无金句。</p>
        ) : (
          <ul
            data-slot="golden-quote-list"
            className="flex flex-col gap-1.5"
            aria-label="金句候选"
          >
            {items.map((item) => (
              <li
                key={item.id}
                data-slot="golden-quote-row"
                data-quote-id={item.id}
                className="rounded-control border border-border bg-brand-soft/40 px-2.5 py-1.5"
              >
                <p className="text-sm font-semibold text-brand">
                  “{item.text}”
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// Kept to silence unused-import warnings while preserving the public
// import surface.
export type { ProjectStageName };
