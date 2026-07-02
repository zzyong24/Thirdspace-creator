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
import { ScriptRichEditor } from "./script-rich-editor";
import { sectionsToHtml } from "./script-editor-bridge";
import { ScriptDraftIsland } from "./script-draft-island";
import { ScriptVersionRestore } from "./script-version-restore";
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
  /**
   * Editor sections derived from the 分镜脚本 artifact's CURRENT version
   * (contentData.sections, or contentText as a single section). Supplied by the
   * async route (`loadScriptEditorSections`) so a saved / AI-drafted script
   * round-trips into the editor.
   * [T-050] 非 null(含空数组)= 真实读结果,直接渲染 —— 空数组显真实空编辑器,
   * 不再回落 fixture demo sections。null/缺省(测试路径)才用 vm.sections。
   * T-019(L4):这些 sections 用于拼出 TipTap 的初始 HTML(`editorHtmlOverride` 缺省时)。
   */
  readonly sectionsOverride?: ReadonlyArray<ScriptSectionView> | null;
  /**
   * [T-050] The DB-resolved script artifact id (output_script 优先,回退 master_script)。
   * 传了(含 null)就接管 vm.scriptArtifactId —— fixture 查表旁路退役;null = 项目还没有
   * 脚本 artifact([T-053] AI 起草岛照常渲染,点开始时 ensureScriptArtifact getOrCreate)。
   * 缺省(测试)保持 vm。
   */
  readonly scriptArtifactIdOverride?: string | null;
  /**
   * T-019(L4):分镜脚本 artifact 当前版本的 TipTap 初始 HTML(`contentData.html` 优先,
   * 否则从 sections 拼)。非 null 时直接作编辑器初值(富文本忠实往返);null → 回退到
   * 从 `sectionsOverride`/fixture sections 拼出的 HTML。由 async route 提供。
   */
  readonly editorHtmlOverride?: string | null;
  /**
   * GAP-SCR-1: the REAL version history (artifacts.versions.list). When supplied
   * (non-null), it overrides the fixture `vm.versions`. An empty array is a valid
   * real result (renders the "暂无版本记录" empty state). null → keep fixture.
   */
  readonly versionsOverride?: ScriptViewModel["versions"] | null;
  /**
   * GAP-SCR-1: the REAL outline derived from the CURRENT version's section
   * headings. Overrides the fixture `vm.outline` when supplied. null → fixture.
   */
  readonly outlineOverride?: ScriptViewModel["outline"] | null;
  /**
   * GAP-SCR-1: REAL pull-quote candidates derived from emphasis sections.
   * Overrides the fixture `vm.goldenQuotes` when supplied. null → fixture.
   */
  readonly goldenQuotesOverride?: ScriptViewModel["goldenQuotes"] | null;
  /**
   * GAP-SCR-1: switches the AI 写作建议 card to its honest empty-state guidance
   * (there is no deterministic suggestions producer this wave). The async route
   * passes `true` for a real, persisted script so the rail stops rendering the
   * fixture桩 and instead guides the creator to run the 分镜脚本 AI node. Defaults
   * to false so the fixture/demo path keeps its curated suggestions.
   */
  readonly aiSuggestionsGuide?: boolean;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ScriptWorkspacePage({
  projectId,
  viewModel,
  sectionsOverride,
  editorHtmlOverride,
  versionsOverride,
  outlineOverride,
  goldenQuotesOverride,
  scriptArtifactIdOverride,
  aiSuggestionsGuide = false,
}: ScriptWorkspacePageProps) {
  const vm = viewModel ?? buildScriptViewModel(projectId);
  // [T-050] 非 null override(含空数组)= 真实读结果直接渲染;只有 null/缺省(测试
  // 基线)才落 vm.sections —— demo sections 不再注入真项目。
  const editorSections = sectionsOverride ?? vm.sections;
  // [T-050] artifactId:route 传入 DB 解析值(含 null)即接管;缺省保持 vm(测试)。
  const scriptArtifactId =
    scriptArtifactIdOverride !== undefined
      ? scriptArtifactIdOverride
      : vm.scriptArtifactId;
  // T-019(L4):TipTap 初始 HTML —— 真实存的富文本 html(editorHtmlOverride)优先,
  // 否则从 sections(override 或 fixture)拼出。pure(sectionsToHtml 无 DOM,Server 安全)。
  const initialHtml =
    editorHtmlOverride ?? sectionsToHtml(editorSections);
  // GAP-SCR-1 per-field overrides: a non-null override (even an empty array) is a
  // REAL read result and wins over the fixture桩; null keeps the fixture field so
  // the demo / unit-test baseline does not regress.
  const versions = versionsOverride ?? vm.versions;
  const outline = outlineOverride ?? vm.outline;
  const goldenQuotes = goldenQuotesOverride ?? vm.goldenQuotes;
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
          <ScriptRichEditor
            initialHtml={initialHtml}
            artifactId={scriptArtifactId}
            projectId={vm.projectId}
          />
          <VersionHistoryStrip
            versions={versions}
            artifactId={scriptArtifactId}
          />
        </div>
        <div
          data-slot="script-right-rail"
          className="flex flex-col gap-card-gap"
        >
          <ScriptDraftIsland
            projectId={vm.projectId}
            artifactId={scriptArtifactId}
            topic={vm.topic}
          />
          <OutlineStructureCard items={outline} />
          <AIWritingSuggestionsCard
            items={vm.aiSuggestions}
            guide={aiSuggestionsGuide}
          />
          <GoldenQuotesCard items={goldenQuotes} />
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
  artifactId,
}: {
  versions: ScriptViewModel["versions"];
  artifactId: string | null;
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
                {artifactId ? (
                  <ScriptVersionRestore
                    artifactId={artifactId}
                    versionId={version.id}
                  />
                ) : null}
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
          <p className="text-sm text-muted-foreground">
            保存或生成脚本后，这里会列出各分段标题作为大纲。
          </p>
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
  guide,
}: {
  items: ScriptViewModel["aiSuggestions"];
  /**
   * GAP-SCR-1: when true, this card has NO deterministic suggestions producer, so
   * it renders an honest "AI 生成区" empty-state that guides the creator to run the
   * 分镜脚本 AI node (right rail above) instead of showing a fixture桩.
   */
  guide?: boolean;
}) {
  if (guide) {
    return (
      <div
        data-slot="ai-writing-suggestions-card"
        data-ai-region="true"
        data-empty="guide"
      >
        <SectionCard title="AI 写作建议" description="AI 生成区">
          <div className="flex flex-col gap-1.5 rounded-control border border-dashed border-border bg-surface px-2.5 py-2">
            <p className="text-sm font-medium text-foreground">
              点上方「帮我写分镜脚本」生成建议
            </p>
            <p className="text-xs text-muted-foreground">
              本区由 AI 分镜节点产出，跑一次后这里会给出针对当前脚本的写作建议。
            </p>
          </div>
        </SectionCard>
      </div>
    );
  }
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
          <p className="text-sm text-muted-foreground">
            把脚本里想强调的句子标为金句段，这里会自动汇总成候选。
          </p>
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
