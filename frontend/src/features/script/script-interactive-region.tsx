"use client";

/**
 * Script editor interactive island (Increment 4 / page-specs §7).
 *
 * The Script Workspace page is a Server Component shell. This client
 * island owns the editor's interactive surface:
 *
 *  - the EditorToolbar buttons are ENABLED — the format buttons are
 *    real toggles (bold starts pressed, matching the canonical
 *    emphasis), and the glyph buttons are clickable,
 *  - the ScriptDocument body of each section is an editable region
 *    (a controlled `<textarea>` per section — no rich-text framework,
 *    the component registry is blocked) bound to local client state,
 *  - editing any section flips a visible save-status indicator to
 *    "有未保存的修改" (dirty); a Save action returns it to "已保存",
 *  - the word count recomputes from the live edited bodies.
 *
 * Determinism: no `Date.now` / `Math.random` / network. Initial state is
 * seeded purely from the ViewModel the server shell passes in.
 *
 * The DOM shape (slots, headings, time codes, the purple golden-quote
 * emphasis, role="toolbar", aria-pressed) is preserved so the existing
 * structural contract tests continue to pass; the semantic upgrade is
 * within the same slots.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import type { ScriptSectionView, ScriptViewModel } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Toolbar descriptors
// ---------------------------------------------------------------------------

interface ToolbarButton {
  readonly id: string;
  readonly format: "bold" | "italic" | "underline" | "strike";
  readonly label: string;
  readonly initialPressed: boolean;
}

const TOOLBAR_FORMAT_BUTTONS: ReadonlyArray<ToolbarButton> = [
  { id: "fmt-bold", format: "bold", label: "加粗", initialPressed: true },
  { id: "fmt-italic", format: "italic", label: "斜体", initialPressed: false },
  { id: "fmt-underline", format: "underline", label: "下划线", initialPressed: false },
  { id: "fmt-strike", format: "strike", label: "删除线", initialPressed: false },
];

const TOOLBAR_HEADING_BUTTONS: ReadonlyArray<ToolbarButton> = [
  { id: "fmt-h1", format: "bold", label: "标题 1", initialPressed: false },
  { id: "fmt-h2", format: "bold", label: "标题 2", initialPressed: false },
  { id: "fmt-h3", format: "bold", label: "标题 3", initialPressed: false },
];

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
// Island
// ---------------------------------------------------------------------------

type SaveStatus = ScriptViewModel["toolbarState"]["status"];

export interface ScriptInteractiveRegionProps {
  readonly sections: ReadonlyArray<ScriptSectionView>;
  readonly toolbarState: ScriptViewModel["toolbarState"];
}

export function ScriptInteractiveRegion({
  sections,
  toolbarState,
}: ScriptInteractiveRegionProps) {
  // Live, editable section bodies keyed by section id.
  const [bodies, setBodies] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(sections.map((section) => [section.id, section.body])),
  );
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>(
    toolbarState.status,
  );
  const [pressed, setPressed] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      [...TOOLBAR_FORMAT_BUTTONS, ...TOOLBAR_HEADING_BUTTONS].map((button) => [
        button.id,
        button.initialPressed,
      ]),
    ),
  );

  const wordCount = React.useMemo(
    () =>
      Object.values(bodies).reduce(
        (total, body) => total + body.length,
        0,
      ),
    [bodies],
  );

  const handleBodyChange = React.useCallback(
    (sectionId: string, value: string) => {
      setBodies((prev) => ({ ...prev, [sectionId]: value }));
      setSaveStatus("dirty");
    },
    [],
  );

  const handleSave = React.useCallback(() => {
    setSaveStatus("saved");
  }, []);

  const toggleFormat = React.useCallback((id: string) => {
    setPressed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div data-slot="rich-text-editor">
      <SectionCard
        title="主脚本"
        description="脚本正文与工具栏共用同一编辑器壳层"
      >
        <EditorToolbar
          pressed={pressed}
          onToggleFormat={toggleFormat}
          onSave={handleSave}
          saveStatus={saveStatus}
        />
        <ScriptDocument
          sections={sections}
          bodies={bodies}
          onBodyChange={handleBodyChange}
        />
        <EditorStatusBar wordCount={wordCount} saveStatus={saveStatus} />
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditorToolbar (enabled controls)
// ---------------------------------------------------------------------------

function EditorToolbar({
  pressed,
  onToggleFormat,
  onSave,
  saveStatus,
}: {
  pressed: Record<string, boolean>;
  onToggleFormat: (id: string) => void;
  onSave: () => void;
  saveStatus: SaveStatus;
}) {
  return (
    <div
      role="toolbar"
      data-slot="editor-toolbar"
      aria-label="脚本编辑器工具栏"
      className="flex flex-wrap items-center gap-1 rounded-control border border-border bg-surface-subtle/70 p-1.5"
    >
      <ToolbarGroup label="格式">
        {TOOLBAR_FORMAT_BUTTONS.map((button) => (
          <ToolbarButtonControl
            key={button.id}
            button={button}
            pressed={pressed[button.id] ?? false}
            onToggle={onToggleFormat}
          />
        ))}
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup label="标题">
        {TOOLBAR_HEADING_BUTTONS.map((button) => (
          <ToolbarButtonControl
            key={button.id}
            button={button}
            pressed={pressed[button.id] ?? false}
            onToggle={onToggleFormat}
          />
        ))}
      </ToolbarGroup>
      <ToolbarDivider />
      <ToolbarGroup label="插入">
        {TOOLBAR_GLYPH_BUTTONS.map((glyph) => (
          <ToolbarGlyphControl key={glyph.id} glyph={glyph} />
        ))}
      </ToolbarGroup>
      <ToolbarDivider />
      <button
        type="button"
        data-slot="editor-save-button"
        onClick={onSave}
        disabled={saveStatus === "saved"}
        className="ml-auto inline-flex h-7 items-center rounded-md border border-transparent bg-brand px-2.5 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        保存
      </button>
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

function ToolbarButtonControl({
  button,
  pressed,
  onToggle,
}: {
  button: ToolbarButton;
  pressed: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      data-slot="editor-toolbar-button"
      data-format={button.format}
      data-button-id={button.id}
      aria-pressed={pressed}
      onClick={() => onToggle(button.id)}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-transparent bg-surface px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
      data-pressed={pressed}
    >
      {button.label}
    </button>
  );
}

function ToolbarGlyphControl({ glyph }: { glyph: ToolbarGlyph }) {
  const [active, setActive] = React.useState(false);
  return (
    <button
      type="button"
      data-slot="editor-toolbar-glyph"
      data-glyph-id={glyph.id}
      aria-pressed={active}
      onClick={() => setActive((prev) => !prev)}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-transparent bg-surface px-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted data-[pressed=true]:bg-brand-soft data-[pressed=true]:text-brand"
      data-pressed={active}
    >
      <span aria-hidden="true">{glyph.label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ScriptDocument (editable section bodies)
// ---------------------------------------------------------------------------

function ScriptDocument({
  sections,
  bodies,
  onBodyChange,
}: {
  sections: ReadonlyArray<ScriptSectionView>;
  bodies: Record<string, string>;
  onBodyChange: (sectionId: string, value: string) => void;
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
          <ScriptSection
            key={section.id}
            section={section}
            value={bodies[section.id] ?? section.body}
            onChange={(value) => onBodyChange(section.id, value)}
          />
        ))
      )}
    </div>
  );
}

function ScriptSection({
  section,
  value,
  onChange,
}: {
  section: ScriptSectionView;
  value: string;
  onChange: (value: string) => void;
}) {
  const timecodeLabel = formatTimeCode(section.startSeconds);
  const editorId = `script-section-input-${section.id}`;
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
      <label className="sr-only" htmlFor={editorId}>
        {`编辑「${section.heading}」段落`}
      </label>
      <textarea
        id={editorId}
        data-slot={section.emphasis ? "script-emphasis" : "script-section-body"}
        data-section-id={section.id}
        aria-label={`编辑「${section.heading}」段落`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={Math.max(2, Math.ceil(value.length / 36))}
        className={
          section.emphasis
            ? "w-full resize-none rounded-control border border-border/60 bg-transparent px-1.5 py-1 text-sm font-semibold leading-relaxed text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            : "w-full resize-none rounded-control border border-border/60 bg-transparent px-1.5 py-1 text-sm leading-relaxed text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        }
      />
    </article>
  );
}

// ---------------------------------------------------------------------------
// EditorStatusBar
// ---------------------------------------------------------------------------

function EditorStatusBar({
  wordCount,
  saveStatus,
}: {
  wordCount: number;
  saveStatus: SaveStatus;
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function sectionTypeLabel(type: ScriptSectionView["type"]): string {
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

function saveStatusLabel(status: SaveStatus): string {
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

function saveStatusToneClass(status: SaveStatus): string {
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
