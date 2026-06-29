/**
 * Planning Workspace page (Task 14 / page-specs §6).
 *
 * The `project-workspace` Header mode landing page for the Planning
 * stage. Composes:
 *  - a PlanningTabs strip with five locked tabs
 *    内容合同 / 论点树 / 证据地图 / 受众洞察 / 差异化亮点,
 *  - a Main column with the ContentContractSection (4 ContractCard in
 *    a row: 受众定位 / 价值主张 / 核心节奏 / 行动召唤), the emphasised
 *    CoreThesisCard (separate from the contract row), and the
 *    ThesisTreeSection (central root node with 4 structured columns:
 *    核心论点 / 支持依据 / 证据 / 反驳),
 *  - a right rail with EvidenceMapCard followed by KeyMaterialsCard.
 *
 * Layout invariants (locked by the page spec):
 *  - left-wide / right-narrow two-column grid,
 *  - exactly four ContractCard in a row,
 *  - Core Thesis is a separate, emphasised card (NOT merged with
 *    the contract row),
 *  - thesis tree is a structured 4-column layout (NOT a free canvas),
 *  - exactly 5 planning tabs in the locked spec order,
 *  - right rail order EvidenceMap → KeyMaterials.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted once
 * for the whole route group. The page just provides the content slot.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { PageTabs } from "@/components/navigation/page-tabs";
import { buildPlanningViewModel } from "@/fixtures/selectors";
import { PlanningThesisIsland } from "@/features/planning/planning-thesis-island";
import { PlanningContractIsland } from "@/features/planning/planning-contract-island";
import { PlanningOutlineIsland } from "@/features/planning/planning-outline-island";
import type {
  ContractCard,
  PlanningViewModel,
  ThesisNodeView,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlanningWorkspacePageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: PlanningViewModel;
  /**
   * The project's `thesis_tree` artifact id — the write target for the planning.thesis
   * AI node. When present, the page mounts the `PlanningThesisIsland` so the creator can
   * draft + 采纳 a 论点树 (which appends a new ArtifactVersion the read side picks up).
   * Optional so the existing page tests (which omit it) keep rendering unchanged.
   */
  readonly thesisArtifactId?: string | null;
  /**
   * The project's `content_contract` artifact id — the write target for the
   * planning.contract AI node. When present, the page mounts the `PlanningContractIsland`
   * (帮我生成内容合同). Optional so existing tests keep rendering unchanged.
   */
  readonly contractArtifactId?: string | null;
  /**
   * The project's `content_outline` artifact id — the write target for the
   * planning.outline AI node. When present, the page mounts the `PlanningOutlineIsland`
   * (帮我生成结构方案). Optional so existing tests keep rendering unchanged.
   */
  readonly outlineArtifactId?: string | null;
}

// ---------------------------------------------------------------------------
// Locked thesis column descriptors (structured 4 columns, NOT a canvas)
// ---------------------------------------------------------------------------

const THESIS_COLUMNS: ReadonlyArray<{
  readonly id: string;
  readonly title: string;
}> = [
  { id: "core", title: "核心论点" },
  { id: "support", title: "支持依据" },
  { id: "evidence", title: "证据" },
  { id: "counter", title: "反驳" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PlanningWorkspacePage({
  projectId,
  viewModel,
  thesisArtifactId,
  contractArtifactId,
  outlineArtifactId,
}: PlanningWorkspacePageProps) {
  const vm = viewModel ?? buildPlanningViewModel(projectId);
  return (
    <main
      data-app="creatoros"
      data-page="planning"
      data-project-id={vm.projectId}
      className="flex flex-col gap-section-gap"
    >
      <PlanningTabs tabs={vm.tabs} />
      <div
        data-slot="planning-grid"
        className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_400px]"
      >
        <div
          data-slot="planning-main-column"
          className="flex flex-col gap-card-gap"
        >
          <ContentContractSection contracts={vm.contracts} />
          {contractArtifactId ? (
            <div data-slot="planning-contract-node">
              <PlanningContractIsland
                projectId={vm.projectId}
                artifactId={contractArtifactId}
                topic={vm.coreThesis.title}
              />
            </div>
          ) : null}
          <CoreThesisCard
            id={vm.coreThesis.id}
            title={vm.coreThesis.title}
            body={vm.coreThesis.body}
          />
          <ThesisTreeSection
            nodes={vm.thesisTree}
            rootLabel={vm.coreThesis.title}
          />
          {thesisArtifactId ? (
            <div data-slot="planning-thesis-node">
              <PlanningThesisIsland
                projectId={vm.projectId}
                artifactId={thesisArtifactId}
                topic={vm.coreThesis.title}
              />
            </div>
          ) : null}
          {outlineArtifactId ? (
            <div data-slot="planning-outline-node">
              <PlanningOutlineIsland
                projectId={vm.projectId}
                artifactId={outlineArtifactId}
                topic={vm.coreThesis.title}
              />
            </div>
          ) : null}
        </div>
        <div
          data-slot="planning-right-rail"
          className="flex flex-col gap-card-gap"
        >
          <EvidenceMapCard items={vm.evidenceMap} />
          <KeyMaterialsCard items={vm.keyMaterials} />
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// PlanningTabs
// ---------------------------------------------------------------------------

function PlanningTabs({
  tabs,
}: {
  tabs: PlanningViewModel["tabs"];
}) {
  return (
    <div data-slot="planning-tabs">
      <div data-slot="page-tabs">
        <PageTabs
          tabs={tabs}
          defaultValue={tabs[0]?.id}
          ariaLabel="策划阶段子页签"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContentContractSection (4 ContractCard in a row)
// ---------------------------------------------------------------------------

function ContentContractSection({
  contracts,
}: {
  contracts: ReadonlyArray<ContractCard>;
}) {
  return (
    <div data-slot="content-contract-section">
      <SectionCard
        title="内容合同"
        description="与观众的契约:四个角度的内容承诺（策划脚手架,随 AI 生成回填）"
        action={
          <button
            type="button"
            data-slot="contract-view-all"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            查看全部
          </button>
        }
      >
        <ul
          data-slot="contract-card-list"
          className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4"
          aria-label="内容合同卡片"
        >
          {contracts.map((contract) => (
            <li
              key={contract.id}
              data-slot="contract-card"
              data-contract-id={contract.id}
              data-status={contract.status}
              className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-subtle p-3"
            >
              <span
                data-slot="contract-card-title"
                className="text-[13px] font-semibold text-foreground"
              >
                {contract.title}
              </span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {contract.description}
              </p>
              <span className="mt-auto pt-1">
                <TagChip
                  label={contract.status === "approved" ? "已确认" : "草案"}
                  tone={contract.status === "approved" ? "success" : "info"}
                  size="sm"
                />
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CoreThesisCard (separate, emphasised)
// ---------------------------------------------------------------------------

function CoreThesisCard({
  id,
  title,
  body,
}: {
  id: string;
  title: string;
  body: string;
}) {
  return (
    <div data-slot="core-thesis-card" data-thesis-id={id}>
      <SectionCard
        title="核心论点"
        description="整期内容的核心立意"
      >
        <div className="flex flex-col gap-1.5 border-l-2 border-brand/60 pl-3">
          <h2 className="text-base font-semibold leading-snug text-foreground">
            {title}
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThesisTreeSection (structured 4 columns + central root)
// ---------------------------------------------------------------------------

function ThesisTreeSection({
  nodes,
  rootLabel,
}: {
  nodes: ReadonlyArray<ThesisNodeView>;
  rootLabel: string;
}) {
  const nodesByColumn: Record<ThesisNodeView["column"], ThesisNodeView[]> = {
    core: [],
    support: [],
    evidence: [],
    counter: [],
  };
  for (const node of nodes) {
    nodesByColumn[node.column].push(node);
  }
  // The root is the project's REAL core proposition: the first 核心论点 (core column)
  // node when the AI thesis tree has been adopted, else the project's coreThesis title.
  // NEVER a hardcoded constant — a real project must show its own core thesis.
  const rootText =
    nodesByColumn.core.find((n) => n.title.trim().length > 0)?.title ??
    (rootLabel.trim().length > 0 ? rootLabel : "核心论点（用 AI 起草论点树后回填）");
  return (
    <div data-slot="thesis-tree-section">
      <SectionCard
        title="论点树"
        description="中央根节点向四个方向分支的结构化论点"
      >
        <div
          data-slot="thesis-tree-root"
          className="mb-3 flex items-center justify-center rounded-card border border-brand/50 bg-brand-soft/50 px-4 py-2.5 text-center text-[15px] font-semibold text-foreground"
        >
          {rootText}
        </div>
        <ul
          data-slot="thesis-column-list"
          className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4"
          aria-label="论点树分支"
        >
          {THESIS_COLUMNS.map((column) => {
            const columnNodes = nodesByColumn[column.id as ThesisNodeView["column"]];
            return (
              <li
                key={column.id}
                data-slot="thesis-column"
                data-column-id={column.id}
                className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-subtle p-3"
              >
                <span
                  data-slot="thesis-column-title"
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {column.title}
                </span>
                {columnNodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无数据。</p>
                ) : (
                  <ul
                    data-slot="thesis-node-list"
                    className="flex flex-col gap-1.5"
                    aria-label={`${column.title}节点`}
                  >
                    {columnNodes.map((node) => (
                      <li
                        key={node.id}
                        data-slot="thesis-node"
                        data-node-id={node.id}
                        className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-3 py-2"
                      >
                        <span className="text-[13px] font-medium text-foreground">
                          {node.title}
                        </span>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {node.summary}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right rail
// ---------------------------------------------------------------------------

function EvidenceMapCard({
  items,
}: {
  items: PlanningViewModel["evidenceMap"];
}) {
  return (
    <div data-slot="evidence-map-card">
      <SectionCard
        title="证据地图"
        description={`${items.length} 条证据已关联到论点`}
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无证据。</p>
        ) : (
          <ul
            data-slot="evidence-list"
            className="flex flex-col gap-1.5"
            aria-label="证据地图"
          >
            {items.map((item) => (
              <li
                key={item.id}
                data-slot="evidence-row"
                data-evidence-id={item.id}
                className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-3 py-2"
              >
                <span className="text-[13px] font-medium text-foreground">
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {`置信度 · ${(item.confidence * 100).toFixed(0)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function KeyMaterialsCard({
  items,
}: {
  items: PlanningViewModel["keyMaterials"];
}) {
  return (
    <div data-slot="key-materials-card">
      <SectionCard
        title="关键素材"
        description="本阶段引用的核心素材"
        action={
          <button
            type="button"
            data-slot="key-materials-view-all"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            全部素材
          </button>
        }
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无关键素材。</p>
        ) : (
          <ul
            data-slot="key-materials-list"
            className="flex flex-col gap-1.5"
            aria-label="关键素材"
          >
            {items.map((item) => (
              <li
                key={item.id}
                data-slot="key-material-row"
                data-material-id={item.id}
                className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2"
              >
                <span className="text-[13px] font-medium text-foreground">
                  {item.title}
                </span>
                <span>
                  <TagChip label={item.type} tone="brand" size="sm" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
