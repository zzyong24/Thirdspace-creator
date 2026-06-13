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
import { canonicalDataset, getProjectById } from "@/fixtures/canonical";
import type {
  ContractCard,
  PlanningViewModel,
  ThesisNodeView,
} from "@/types/view-models";
import type { ProjectStageName } from "@/types/domain";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlanningWorkspacePageProps {
  /** The id of the project to render. */
  readonly projectId: string;
  /** Override hook for tests; defaults to the production selector. */
  readonly viewModel?: PlanningViewModel;
}

// ---------------------------------------------------------------------------
// Locked tab descriptors (page-specs §6: spec order is the source of truth)
// ---------------------------------------------------------------------------

const PLANNING_TABS: ReadonlyArray<PlanningViewModel["tabs"][number]> = [
  { id: "content-contract", label: "内容合同" },
  { id: "thesis-tree", label: "论点树" },
  { id: "evidence-map", label: "证据地图" },
  { id: "audience-insight", label: "受众洞察" },
  { id: "differentiation", label: "差异化亮点" },
];

// ---------------------------------------------------------------------------
// Locked contract card descriptors
// ---------------------------------------------------------------------------

const CONTRACT_CARDS: ReadonlyArray<{
  readonly id: ContractCard["id"];
  readonly title: string;
  readonly description: string;
}> = [
  {
    id: "contract-audience",
    title: "受众定位",
    description: "目标用户画像、痛点与触发场景。",
  },
  {
    id: "contract-value",
    title: "价值主张",
    description: "本节目承诺的独特价值与差异化收益。",
  },
  {
    id: "contract-pacing",
    title: "核心节奏",
    description: "开场 15 秒、幕间过渡与高潮节点的节奏安排。",
  },
  {
    id: "contract-cta",
    title: "行动召唤",
    description: "结尾的行动召唤文案与转化路径。",
  },
];

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
}: PlanningWorkspacePageProps) {
  const vm = viewModel ?? buildPlanningViewModel(projectId);
  return (
    <main
      data-app="creatoros"
      data-page="planning"
      data-project-id={vm.projectId}
      className="flex flex-col gap-(--section-gap)"
    >
      <PlanningTabs tabs={vm.tabs} />
      <div
        data-slot="planning-grid"
        className="grid grid-cols-1 gap-(--card-gap) lg:grid-cols-3"
      >
        <div
          data-slot="planning-main-column"
          className="flex flex-col gap-(--card-gap) lg:col-span-2"
        >
          <ContentContractSection contracts={vm.contracts} />
          <CoreThesisCard
            id={vm.coreThesis.id}
            title={vm.coreThesis.title}
            body={vm.coreThesis.body}
          />
          <ThesisTreeSection nodes={vm.thesisTree} />
        </div>
        <div
          data-slot="planning-right-rail"
          className="flex flex-col gap-(--card-gap) lg:col-span-1"
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
        description="与观众的契约:四个角度的内容承诺"
      >
        <ul
          data-slot="contract-card-list"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
          aria-label="内容合同卡片"
        >
          {contracts.map((contract) => (
            <li
              key={contract.id}
              data-slot="contract-card"
              data-contract-id={contract.id}
              data-status={contract.status}
              className="flex flex-col gap-2 rounded-card border border-border bg-surface-subtle p-3"
            >
              <span
                data-slot="contract-card-title"
                className="text-sm font-semibold text-foreground"
              >
                {contract.title}
              </span>
              <p className="text-xs text-muted-foreground">
                {contract.description}
              </p>
              <span className="mt-auto">
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
        <div className="flex flex-col gap-2">
          <h2 className="truncate text-base font-semibold text-foreground">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{body}</p>
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
}: {
  nodes: ReadonlyArray<ThesisNodeView>;
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
  return (
    <div data-slot="thesis-tree-section">
      <SectionCard
        title="论点树"
        description="中央根节点向四个方向分支的结构化论点"
      >
        <div
          data-slot="thesis-tree-root"
          className="mb-4 flex items-center justify-center rounded-card border border-brand/40 bg-brand-soft/40 px-3 py-2 text-sm font-semibold text-foreground"
        >
          AI Native Browser 重塑入口
        </div>
        <ul
          data-slot="thesis-column-list"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"
          aria-label="论点树分支"
        >
          {THESIS_COLUMNS.map((column) => {
            const columnNodes = nodesByColumn[column.id as ThesisNodeView["column"]];
            return (
              <li
                key={column.id}
                data-slot="thesis-column"
                data-column-id={column.id}
                className="flex flex-col gap-2 rounded-card border border-border bg-surface-subtle p-3"
              >
                <span
                  data-slot="thesis-column-title"
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {column.title}
                </span>
                {columnNodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无数据。</p>
                ) : (
                  <ul
                    data-slot="thesis-node-list"
                    className="flex flex-col gap-2"
                    aria-label={`${column.title}节点`}
                  >
                    {columnNodes.map((node) => (
                      <li
                        key={node.id}
                        data-slot="thesis-node"
                        data-node-id={node.id}
                        className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2"
                      >
                        <span className="truncate text-sm font-medium text-foreground">
                          {node.title}
                        </span>
                        <p className="text-xs text-muted-foreground">
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
            className="flex flex-col gap-2"
            aria-label="证据地图"
          >
            {items.map((item) => (
              <li
                key={item.id}
                data-slot="evidence-row"
                data-evidence-id={item.id}
                className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2"
              >
                <span className="truncate text-sm font-medium text-foreground">
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
      <SectionCard title="关键素材" description="本阶段引用的核心素材">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无关键素材。</p>
        ) : (
          <ul
            data-slot="key-materials-list"
            className="flex flex-col gap-2"
            aria-label="关键素材"
          >
            {items.map((item) => (
              <li
                key={item.id}
                data-slot="key-material-row"
                data-material-id={item.id}
                className="flex flex-col gap-1 rounded-control border border-border bg-surface px-3 py-2"
              >
                <span className="truncate text-sm font-medium text-foreground">
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

// ---------------------------------------------------------------------------
// Selector: build the Planning Workspace ViewModel
// ---------------------------------------------------------------------------

export function buildPlanningViewModel(
  projectId: string,
): PlanningViewModel {
  const project = getProjectById(projectId);
  if (!project) {
    return {
      scenario: "empty",
      kind: "planning",
      projectId,
      tabs: PLANNING_TABS,
      contracts: CONTRACT_CARDS.map((entry) => ({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        status: "drafting" as const,
      })),
      coreThesis: {
        id: "core-thesis-empty",
        title: "未找到项目",
        body: "请选择一个有效项目查看策划工作区。",
      },
      thesisTree: [],
      evidenceMap: [],
      keyMaterials: [],
      loading: false,
      error: null,
    };
  }

  return {
    scenario: "default",
    kind: "planning",
    projectId: project.id,
    tabs: PLANNING_TABS,
    contracts: buildContracts(project.id),
    coreThesis: buildCoreThesis(project.id),
    thesisTree: buildThesisTree(project.id),
    evidenceMap: buildEvidenceMap(project.id),
    keyMaterials: buildKeyMaterials(project.id),
    loading: false,
    error: null,
  };
}

function buildContracts(projectId: string): ReadonlyArray<ContractCard> {
  void projectId;
  return CONTRACT_CARDS.map((entry, index) => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    // Lock the first two cards as approved to mirror the canonical
    // planning dataset (受众定位 / 价值主张 are signed off, the rest
    // are still drafting). Index is deterministic.
    status: (index < 2 ? "approved" : "drafting") as ContractCard["status"],
  }));
}

function buildCoreThesis(projectId: string): PlanningViewModel["coreThesis"] {
  const root = canonicalDataset.thesisNodes.find(
    (node) =>
      node.artifactVersionId === "av-ainativebrowser-thesis-tree" &&
      node.nodeType === "root" &&
      canonicalDataset.thesisNodes.some(
        (candidate) => candidate.parentNodeId === node.id,
      ),
  );
  if (root) {
    return {
      id: root.id,
      title: "AI Native Browser 重塑入口",
      body: root.content,
    };
  }
  void projectId;
  return {
    id: "core-thesis-fallback",
    title: "AI Native Browser 重塑入口",
    body: "浏览器将成为个人 AI 代理的主要入口，重塑信息分发与生产力。",
  };
}

function buildThesisTree(
  projectId: string,
): ReadonlyArray<ThesisNodeView> {
  const treeNodes = canonicalDataset.thesisNodes.filter(
    (node) => node.artifactVersionId === "av-ainativebrowser-thesis-tree",
  );
  if (treeNodes.length === 0) {
    void projectId;
    return DEFAULT_THESIS_TREE;
  }
  return treeNodes
    .filter((node) => node.nodeType !== "root")
    .map((node) => {
      const column: ThesisNodeView["column"] =
        node.nodeType === "core_thesis"
          ? "core"
          : node.nodeType === "supporting"
            ? "support"
            : node.nodeType === "evidence"
              ? "evidence"
              : "counter";
      return {
        id: node.id,
        column,
        title: node.title,
        summary: node.content,
      };
    });
}

const DEFAULT_THESIS_TREE: ReadonlyArray<ThesisNodeView> = [
  {
    id: "node-core-1",
    column: "core",
    title: "核心论点",
    summary: "AI Native Browser = 浏览器 + 代理 + 上下文记忆。",
  },
  {
    id: "node-support-1",
    column: "support",
    title: "从标签页到代理任务",
    summary: "用户操作从打开标签页转向发起代理任务。",
  },
  {
    id: "node-support-2",
    column: "support",
    title: "本地化上下文",
    summary: "用户数据、记忆、订阅均在本地优先。",
  },
  {
    id: "node-evidence-1",
    column: "evidence",
    title: "Arc / Dia 早期用户调研",
    summary: "80% 受访者希望浏览器完成跨站点任务。",
  },
  {
    id: "node-counter-1",
    column: "counter",
    title: "代理幻觉风险",
    summary: "代理生成结果的可信度仍是高门槛。",
  },
];

function buildEvidenceMap(
  projectId: string,
): PlanningViewModel["evidenceMap"] {
  const treeVersion = "av-ainativebrowser-thesis-tree";
  void projectId;
  return canonicalDataset.evidenceLinks
    .filter((link) => link.artifactVersionId === treeVersion)
    .map((link) => {
      const item = canonicalDataset.knowledgeItems.find(
        (candidate) => candidate.id === link.knowledgeItemId,
      );
      return {
        id: link.id,
        title: item?.title ?? link.excerpt,
        confidence: link.confidence,
      };
    });
}

function buildKeyMaterials(
  projectId: string,
): PlanningViewModel["keyMaterials"] {
  void projectId;
  return canonicalDataset.knowledgeItems
    .filter((item) => item.userId === canonicalDataset.user.id)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: knowledgeTypeLabel(item.knowledgeType),
    }));
}

function knowledgeTypeLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    note: "笔记",
    reference: "参考",
    inspiration: "灵感",
    snippet: "片段",
    transcript: "访谈",
  };
  return labels[type] ?? type;
}

// Kept to silence unused-import warnings while preserving the public
// import surface.
export type { ProjectStageName };
