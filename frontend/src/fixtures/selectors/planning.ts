/**
 * Planning Workspace selector.
 *
 * Maps the canonical dataset to the `PlanningViewModel` consumed by the
 * Planning Workspace page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. Page components import
 * `buildPlanningViewModel` from `@/fixtures/selectors` and never
 * dereference `canonicalDataset` for data shaping.
 */

import { canonicalDataset, getProjectById } from "../canonical";
import type {
  ContractCard,
  PlanningViewModel,
  ThesisNodeView,
} from "@/types/view-models";

/**
 * Resolve the URL `[projectId]` segment to a canonical project id.
 *
 * The visual route fixture uses kebab-case slugs (e.g. `ai-native-browser`)
 * while the canonical dataset uses prefixed IDs (e.g.
 * `project-ainativebrowser`). We translate locally so the feature module
 * can stay agnostic of the URL shape.
 *
 * Falls back to the original slug if no canonical match is found, in
 * which case the caller surfaces the "未找到项目" empty state.
 *
 * NOTE: kept local to the Planning feature for now. The same pattern
 * lives in `features/research` and `features/project-overview`; once a
 * shared helper lands (see SHARED-CHANGE-REQUEST), all three call sites
 * will collapse onto it.
 */
function resolveProjectIdSlug(slug: string): string {
  if (!slug) return slug;
  const knownIds = canonicalDataset.projects.map((project) => project.id);
  if (knownIds.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  if (knownIds.includes(candidate)) return candidate;
  return slug;
}

// ---------------------------------------------------------------------------
// Tab descriptors — slimmed to the two tabs that have a real producer + feed
// the script (T-018 / SPEC §3.3). The old five-tab strip (内容合同 / 论点树 /
// 证据地图 / 受众洞察 / 差异化亮点) had three shells with no real data source:
//   · 受众洞察 / 差异化亮点 had NO rendered region at all → absorbed into the
//     内容合同 tab (受众定位 IS 受众洞察; 价值主张 IS 差异化).
//   · 证据地图 has no producer (empty for real projects) → absorbed into the
//     论点树 tab's side rail as the argument's evidence.
// What remains are the two script-skeleton tabs (SEAM-01/02 feed both to the
// script): 内容合同 (受众/价值/节奏/CTA) and 论点树 (核心/支撑/证据/反驳).
// ---------------------------------------------------------------------------

const PLANNING_TABS: ReadonlyArray<PlanningViewModel["tabs"][number]> = [
  { id: "content-contract", label: "内容合同" },
  { id: "thesis-tree", label: "论点树" },
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
// Selector: build the Planning Workspace ViewModel
// ---------------------------------------------------------------------------

export function buildPlanningViewModel(
  projectId: string,
): PlanningViewModel {
  const resolvedId = resolveProjectIdSlug(projectId);
  const project = getProjectById(resolvedId);
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
