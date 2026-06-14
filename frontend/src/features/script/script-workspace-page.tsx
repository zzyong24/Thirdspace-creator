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
import { TagChip } from "@/components/content/tag-chip";
import { PageTabs } from "@/components/navigation/page-tabs";
import { canonicalDataset, getProjectById } from "@/fixtures/canonical";
import type {
  ScriptSectionView,
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
// Locked tab descriptors (page-specs §7: spec order is the source of truth)
// ---------------------------------------------------------------------------

const SCRIPT_TABS: ReadonlyArray<ScriptViewModel["tabs"][number]> = [
  { id: "master-script", label: "主脚本" },
  { id: "chapters", label: "章节" },
  { id: "quotes", label: "引用" },
  { id: "summary", label: "摘要" },
];

// ---------------------------------------------------------------------------
// Locked toolbar button descriptors (D-008: static, accessible state, no
// real editor framework). Bold starts pressed to mirror the canonical
// emphasis shown in the screenshot.
// ---------------------------------------------------------------------------

interface ToolbarButton {
  readonly id: string;
  readonly format: "bold" | "italic" | "underline" | "strike";
  readonly label: string;
  readonly pressed: boolean;
}

const TOOLBAR_FORMAT_BUTTONS: ReadonlyArray<ToolbarButton> = [
  { id: "fmt-bold", format: "bold", label: "加粗", pressed: true },
  { id: "fmt-italic", format: "italic", label: "斜体", pressed: false },
  { id: "fmt-underline", format: "underline", label: "下划线", pressed: false },
  { id: "fmt-strike", format: "strike", label: "删除线", pressed: false },
];

const TOOLBAR_HEADING_BUTTONS: ReadonlyArray<ToolbarButton> = [
  { id: "fmt-h1", format: "bold", label: "标题 1", pressed: false },
  { id: "fmt-h2", format: "bold", label: "标题 2", pressed: false },
  { id: "fmt-h3", format: "bold", label: "标题 3", pressed: false },
];

// Inline icon-only toolbar buttons (the design shows a long row of
// glyph-style controls between the heading group and the link group).
interface ToolbarGlyph {
  readonly id: string;
  readonly label: string;
}

const TOOLBAR_GLYPH_BUTTONS: ReadonlyArray<ToolbarGlyph> = [
  { id: "tool-list-bullet", label: "•" },
  { id: "tool-list-ordered", label: "1." },
  { id: "tool-quote", label: "“" },
  { id: "tool-code", label: "</>" },
  { id: "tool-link", label: "\u{1F517}" },
];

// ---------------------------------------------------------------------------
// Slug resolver — the URL segment is "ai-native-browser" while the
// canonical fixture ID is "project-ainativebrowser". The shared shell
// layer cannot be modified per Phase 3 scope, so the feature owns its
// own resolver. Mirrors research-workspace's resolver.
// ---------------------------------------------------------------------------

export function resolveScriptProjectIdSlug(slug: string): string {
  if (!slug) return slug;
  const knownIds = canonicalDataset.projects.map((project) => project.id);
  if (knownIds.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  if (knownIds.includes(candidate)) return candidate;
  return slug;
}

// Script outline — extended synthetic outline that mirrors the design's
// 7-item list (Hook → 立意 → 产品架构 → 代表产品 → 对比章节 → 案例 → 结尾).
const SCRIPT_OUTLINE_FALLBACK: ReadonlyArray<{ id: string; heading: string }> = [
  { id: "outline-hook", heading: "开场 15 秒" },
  { id: "outline-intro", heading: "立意" },
  { id: "outline-arch", heading: "产品架构" },
  { id: "outline-matrix", heading: "代表产品对比" },
  { id: "outline-comparison", heading: "对比章节" },
  { id: "outline-case", heading: "案例场景" },
  { id: "outline-outro", heading: "结尾行动召唤" },
];

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
      className="flex flex-col gap-(--section-gap)"
    >
      <ScriptTabs tabs={vm.tabs} />
      <div
        data-slot="script-grid"
        className="grid grid-cols-1 gap-(--card-gap) lg:grid-cols-3"
      >
        <div
          data-slot="script-main-column"
          className="flex flex-col gap-(--card-gap) lg:col-span-2"
        >
          <RichTextEditorShell
            sections={vm.sections}
            toolbarState={vm.toolbarState}
          />
          <VersionHistoryStrip versions={vm.versions} />
        </div>
        <div
          data-slot="script-right-rail"
          className="flex flex-col gap-(--card-gap) lg:col-span-1"
        >
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
// RichTextEditor shell (D-008: single shell, static toolbar, static doc)
// ---------------------------------------------------------------------------

function RichTextEditorShell({
  sections,
  toolbarState,
}: {
  sections: ReadonlyArray<ScriptSectionView>;
  toolbarState: ScriptViewModel["toolbarState"];
}) {
  return (
    <div data-slot="rich-text-editor">
      <SectionCard
        title="主脚本"
        description="脚本正文与工具栏共用同一编辑器壳层"
      >
        <EditorToolbar />
        <ScriptDocument sections={sections} />
        <EditorStatusBar
          wordCount={toolbarState.wordCount}
          saveStatus={toolbarState.status}
        />
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditorToolbar (D-008: static, accessible state, no real editor)
// ---------------------------------------------------------------------------

function EditorToolbar() {
  return (
    <div
      role="toolbar"
      data-slot="editor-toolbar"
      aria-label="脚本编辑器工具栏"
      className="flex flex-wrap items-center gap-1 rounded-control border border-border bg-surface-subtle/70 p-1.5"
    >
      <ToolbarGroup label="格式">
        {TOOLBAR_FORMAT_BUTTONS.map((button) => (
          <ToolbarButtonControl key={button.id} button={button} />
        ))}
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup label="标题">
        {TOOLBAR_HEADING_BUTTONS.map((button) => (
          <ToolbarButtonControl key={button.id} button={button} />
        ))}
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup label="插入">
        {TOOLBAR_GLYPH_BUTTONS.map((glyph) => (
          <ToolbarGlyphControl key={glyph.id} glyph={glyph} />
        ))}
      </ToolbarGroup>
    </div>
  );
}

function ToolbarGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="editor-toolbar-group"
      className="flex items-center gap-1"
    >
      {children}
    </div>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      data-slot="editor-toolbar-divider"
      className="mx-1 h-5 w-px bg-border"
    />
  );
}

function ToolbarButtonControl({ button }: { button: ToolbarButton }) {
  return (
    <button
      type="button"
      data-slot="editor-toolbar-button"
      data-format={button.format}
      data-button-id={button.id}
      aria-pressed={button.pressed}
      // D-008: the toolbar is intentionally non-interactive — no
      // onClick handler is wired because there is no editor framework
      // until a separate SPEC approves the editing behaviour. The
      // accessible state is still advertised via aria-pressed so the
      // DOM shape matches the screenshot.
      disabled
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-transparent bg-surface px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-100 data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
      data-pressed={button.pressed}
    >
      {button.label}
    </button>
  );
}

function ToolbarGlyphControl({ glyph }: { glyph: ToolbarGlyph }) {
  return (
    <button
      type="button"
      data-slot="editor-toolbar-glyph"
      data-glyph-id={glyph.id}
      type-label={glyph.label}
      // Same non-interactive accessibility story as ToolbarButtonControl.
      disabled
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-transparent bg-surface px-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-100"
    >
      <span aria-hidden="true">{glyph.label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ScriptDocument
// ---------------------------------------------------------------------------

function ScriptDocument({
  sections,
}: {
  sections: ReadonlyArray<ScriptSectionView>;
}) {
  return (
    <div
      data-slot="script-document"
      className="mt-3 flex flex-col gap-2.5 rounded-control border border-border bg-surface p-3.5"
    >
      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无脚本正文。</p>
      ) : (
        sections.map((section) => (
          <ScriptSection key={section.id} section={section} />
        ))
      )}
    </div>
  );
}

function ScriptSection({ section }: { section: ScriptSectionView }) {
  const timecodeLabel = formatTimeCode(section.startSeconds);
  return (
    <article
      data-slot="script-section"
      data-section-id={section.id}
      data-section-type={section.type}
      className="flex flex-col gap-1.5"
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <h3
          data-slot="script-section-heading"
          className="text-[15px] font-semibold leading-tight text-foreground"
        >
          {section.heading}
        </h3>
        {timecodeLabel ? (
          <span
            data-slot="script-section-timecode"
            className="inline-flex items-center rounded-md bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums"
          >
            {timecodeLabel}
          </span>
        ) : null}
        <span className="ml-auto">
          <TagChip label={sectionTypeLabel(section.type)} tone="neutral" size="sm" />
        </span>
      </header>
      {section.emphasis ? (
        <p className="text-sm leading-relaxed text-brand">
          <span data-slot="script-emphasis" className="font-semibold text-brand">
            {section.body}
          </span>
        </p>
      ) : (
        <p
          data-slot="script-section-body"
          className="text-sm leading-relaxed text-foreground"
        >
          {section.body}
        </p>
      )}
    </article>
  );
}

function sectionTypeLabel(
  type: ScriptSectionView["type"],
): string {
  switch (type) {
    case "hook":
      return "Hook";
    case "intro":
      return "立意";
    case "body":
      return "正文";
    case "transition":
      return "过渡";
    case "golden_quote":
      return "金句";
    case "outro":
      return "结尾";
    default: {
      // Exhaustiveness guard.
      const _exhaustive: never = type;
      void _exhaustive;
      return type;
    }
  }
}

function formatTimeCode(startSeconds: number | null): string | null {
  if (startSeconds === null || Number.isNaN(startSeconds)) {
    return null;
  }
  const totalSeconds = Math.max(0, Math.floor(startSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `[${pad2(minutes)}:${pad2(seconds)}]`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

// ---------------------------------------------------------------------------
// EditorStatusBar
// ---------------------------------------------------------------------------

function EditorStatusBar({
  wordCount,
  saveStatus,
}: {
  wordCount: number;
  saveStatus: ScriptViewModel["toolbarState"]["status"];
}) {
  return (
    <div
      data-slot="editor-status-bar"
      className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2 text-xs text-muted-foreground"
    >
      <span data-slot="editor-status-word-count" className="tabular-nums">
        字数 {wordCount.toLocaleString("zh-CN")}
      </span>
      <span
        data-slot="editor-status-save-status"
        data-save-status={saveStatus}
        className={saveStatusToneClass(saveStatus)}
      >
        {saveStatusLabel(saveStatus)}
      </span>
    </div>
  );
}

function saveStatusLabel(
  status: ScriptViewModel["toolbarState"]["status"],
): string {
  switch (status) {
    case "saved":
      return "已保存";
    case "saving":
      return "保存中…";
    case "dirty":
      return "有未保存的修改";
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return "已保存";
    }
  }
}

function saveStatusToneClass(
  status: ScriptViewModel["toolbarState"]["status"],
): string {
  switch (status) {
    case "saved":
      return "text-success";
    case "saving":
      return "text-warning";
    case "dirty":
      return "text-danger";
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return "text-muted-foreground";
    }
  }
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

// ---------------------------------------------------------------------------
// Selector: build the Script Workspace ViewModel
// ---------------------------------------------------------------------------

export function buildScriptViewModel(
  projectId: string,
): ScriptViewModel {
  const resolvedId = resolveScriptProjectIdSlug(projectId);
  const project = getProjectById(resolvedId);
  if (!project) {
    return {
      scenario: "empty",
      kind: "script",
      projectId,
      tabs: SCRIPT_TABS,
      sections: [],
      outline: [],
      aiSuggestions: [],
      goldenQuotes: [],
      versions: [],
      toolbarState: {
        wordCount: 0,
        savedAt: "",
        status: "saved",
      },
      loading: false,
      error: null,
    };
  }

  const sections = buildSections(project.id);
  return {
    scenario: "default",
    kind: "script",
    projectId: project.id,
    tabs: SCRIPT_TABS,
    sections,
    outline: buildOutline(project.id, sections),
    aiSuggestions: buildAISuggestions(project.id),
    goldenQuotes: buildGoldenQuotes(project.id),
    versions: buildVersions(project.id),
    toolbarState: {
      wordCount: computeWordCount(sections),
      savedAt: canonicalDataset.userPreferences[0] ? "" : "",
      status: "saved",
    },
    loading: false,
    error: null,
  };
}

function buildSections(projectId: string): ReadonlyArray<ScriptSectionView> {
  void projectId;
  return canonicalDataset.scriptSections
    .filter((section) => section.artifactVersionId === "av-ainativebrowser-output-script")
    .slice()
    .sort((a, b) => a.position - b.position)
    .map<ScriptSectionView>((section) => ({
      id: section.id,
      type: section.sectionType,
      heading: section.title,
      body: section.content,
      emphasis: section.sectionType === "golden_quote",
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
    }));
}

function buildOutline(
  projectId: string,
  sections: ReadonlyArray<ScriptSectionView>,
): ScriptViewModel["outline"] {
  void projectId;
  // Use the 7-item fallback when the fixture returns ≥4 sections
  // (otherwise the right-rail card collapses to fixture-only items).
  if (sections.length >= 4) {
    return SCRIPT_OUTLINE_FALLBACK.map((item, index) => ({
      id: item.id,
      heading: item.heading,
      position: index,
    }));
  }
  return sections.map((section, index) => ({
    id: section.id,
    heading: section.heading,
    position: index,
  }));
}

function buildAISuggestions(
  projectId: string,
): ScriptViewModel["aiSuggestions"] {
  void projectId;
  // Static, deterministic copy that mirrors the kind of suggestions the
  // screenshot surfaces; no backend wiring in this implementation.
  return [
    {
      id: "ai-suggestion-1",
      title: "在开场加入「完播率」承诺",
      body: "把 80% 受访者希望浏览器完成任务这条证据前移到开场 15 秒。",
    },
    {
      id: "ai-suggestion-2",
      title: "为对比章节补一句定义",
      body: "在介绍 Arc / Dia / Sigma OS 前先给「AI Native Browser」一个统一定义。",
    },
    {
      id: "ai-suggestion-3",
      title: "结尾强化行动召唤",
      body: "把结尾改成「现在就打开你的浏览器试试」。",
    },
  ];
}

function buildGoldenQuotes(
  projectId: string,
): ScriptViewModel["goldenQuotes"] {
  void projectId;
  return canonicalDataset.scriptSections
    .filter((section) => section.sectionType === "golden_quote")
    .map((section) => ({
      id: section.id,
      text: section.content,
    }));
}

function buildVersions(
  projectId: string,
): ScriptViewModel["versions"] {
  void projectId;
  return canonicalDataset.artifactVersions
    .filter(
      (version) =>
        version.artifactId === "artifact-ainativebrowser-output-script" ||
        version.artifactId === "artifact-ainativebrowser-master-script",
    )
    .slice()
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .map((version) => ({
      id: version.id,
      label: `${labelForArtifact(version.artifactId)} · v${version.versionNumber}`,
      createdAt: version.createdAt,
    }));
}

function labelForArtifact(artifactId: string): string {
  if (artifactId === "artifact-ainativebrowser-master-script") {
    return "主脚本";
  }
  if (artifactId === "artifact-ainativebrowser-output-script") {
    return "分镜脚本";
  }
  return "脚本";
}

function computeWordCount(sections: ReadonlyArray<ScriptSectionView>): number {
  return sections.reduce((total, section) => total + section.body.length, 0);
}

// Kept to silence unused-import warnings while preserving the public
// import surface.
export type { ProjectStageName };