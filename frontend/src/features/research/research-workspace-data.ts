import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildResearchViewModel } from "@/fixtures/selectors";
import type { ResearchViewModel } from "@/types/view-models";

/**
 * Research Workspace READ-side data assembly (Task #90 / "workspace 读侧做真").
 *
 * Assembles a REAL `ResearchViewModel` for the route from:
 *   - `projects.get`        → `idea` (title + brief),
 *   - `materialLinks.list`  → the project's gathered library items,
 *   - `knowledge.get`       → each `entityType:"knowledge"` link resolved to
 *                             its KnowledgeItem (title + knowledgeType).
 *
 * Degrades gracefully PER FIELD: a project that resolves but has no gathered
 * material renders empty `sources`/`notes` (the islands own the empty state);
 * the non-real fields (`trendCards`, `relatedTags`, `evidence`) are ALWAYS
 * empty ([T-050] demo 注入退役 —— 无真源就空态,不用演示内容凑数)。
 *
 * If the project READ throws/404s, the VM is an honest not-found shell
 * (empty data + error copy) — never the fixture demo content.
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend.
 */

// Minimal structural DTOs — the contract client returns parsed resources; we
// only read the fields we map, so a narrow shape keeps the helper decoupled.
interface ProjectDto {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
}

interface MaterialLinkDto {
  readonly entityType: "knowledge" | "asset";
  readonly entityId: string;
  readonly role: string;
  readonly stage: string;
}

interface KnowledgeItemDto {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: "note" | "reference" | "inspiration" | "snippet" | "transcript";
  readonly createdAt: string;
}

// `knowledge.revisions.list` returns KnowledgeRevisionResource rows newest-first;
// rows[0] is the head revision carrying the item's current body text. We only
// read `revisionNumber` (for ordering safety) + `content`.
interface KnowledgeRevisionDto {
  readonly revisionNumber: number;
  readonly content: string;
}

export interface ResearchDataClient {
  getProject(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listMaterialLinks(input: {
    params: undefined;
    query: { projectId: string; page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getKnowledge(input: {
    params: { knowledgeId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listKnowledgeRevisions(input: {
    params: { knowledgeId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  // [T-053 断点④] 读 T-030 重建管线落的 trend_analysis artifact → 趋势与背景卡。
  listArtifacts?(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listArtifactVersions?(input: {
    params: { artifactId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

// trend_analysis artifact 当前版本 contentData 的结构(reconstruct-runner renderResearch
// 落库形状:{ coreTopic, keyPoints[], cases[], dataPoints[{stat,note}], reconstructed })。
interface TrendAnalysisData {
  readonly coreTopic?: string;
  readonly keyPoints?: ReadonlyArray<string>;
  readonly dataPoints?: ReadonlyArray<{ stat?: string; note?: string }>;
}

/**
 * [T-053 断点④] 研究页读重建产物:项目的 trend_analysis artifact(T-030 auto-fill
 * 管线物化的研究重建包)→ 「趋势与背景」卡片。planning 页早已读同管线的 thesis_tree,
 * 研究页此前读不到(同管线两页待遇不同,审计主题 7)。取最高 versionNumber 版本的
 * contentData;无 artifact / 无版本 / 读失败 → [](诚实空)。
 */
async function readTrendCards(
  client: ResearchDataClient,
  projectId: string,
): Promise<ResearchViewModel["trendCards"]> {
  if (!client.listArtifacts || !client.listArtifactVersions) return [];
  try {
    const listed = await client.listArtifacts({
      params: { projectId },
      query: { page: 1, pageSize: 200 },
      body: undefined,
    });
    const artifacts = (Array.isArray(listed) ? listed : []) as Array<{
      id: string;
      artifactType: string;
    }>;
    const trend = artifacts.find((a) => a.artifactType === "trend_analysis");
    if (!trend) return [];
    const versionsRaw = await client.listArtifactVersions({
      params: { artifactId: trend.id },
      query: { page: 1, pageSize: 50 },
      body: undefined,
    });
    const versions = (Array.isArray(versionsRaw) ? versionsRaw : []) as Array<{
      versionNumber: number;
      contentData?: Record<string, unknown> | null;
    }>;
    if (versions.length === 0) return [];
    const head = versions.reduce((a, b) =>
      b.versionNumber > a.versionNumber ? b : a,
    );
    const data = (head.contentData ?? {}) as TrendAnalysisData;
    const cards: Array<ResearchViewModel["trendCards"][number]> = [];
    if (typeof data.coreTopic === "string" && data.coreTopic.trim()) {
      cards.push({
        id: `trend-${trend.id}-core`,
        title: "核心主题 · AI 重建",
        metric: "",
        description: data.coreTopic.trim(),
        tone: "info",
      });
    }
    for (const [i, d] of (data.dataPoints ?? []).entries()) {
      const stat = typeof d.stat === "string" ? d.stat.trim() : "";
      if (!stat) continue;
      cards.push({
        id: `trend-${trend.id}-dp-${i}`,
        title: "数据点 · AI 重建",
        metric: stat,
        description: typeof d.note === "string" ? d.note : "",
        tone: "positive",
      });
    }
    for (const [i, p] of (data.keyPoints ?? []).entries()) {
      if (typeof p !== "string" || !p.trim()) continue;
      cards.push({
        id: `trend-${trend.id}-kp-${i}`,
        title: "要点 · AI 重建",
        metric: "",
        description: p.trim(),
        tone: "info",
      });
    }
    return cards;
  } catch {
    return [];
  }
}

/**
 * Read a knowledge item's CURRENT body text via `knowledge.revisions.list`.
 * Revisions come back newest-first, so the head (highest revisionNumber) is the
 * current content. Returns the trimmed body, or `null` when the read fails / the
 * item has no non-empty revision (caller falls back to the item title — a real
 * item NEVER renders blank).
 */
async function readCurrentContent(
  client: ResearchDataClient,
  knowledgeId: string,
): Promise<string | null> {
  try {
    const revisions = (await client.listKnowledgeRevisions({
      params: { knowledgeId },
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<KnowledgeRevisionDto>;
    if (revisions.length === 0) return null;
    // Defence-in-depth: pick the max revisionNumber rather than trusting order.
    const head = revisions.reduce((a, b) =>
      b.revisionNumber > a.revisionNumber ? b : a,
    );
    const content = head.content.trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

const NO_BRIEF_PLACEHOLDER = "（暂无项目立意，去策划阶段补充）";

// Map a KnowledgeItem's type to one of the static source tabs (全部/文章/视频/
// 报告/播客). The gathered web material is overwhelmingly article-shaped, so
// `reference` → 文章; the rest fall through to 全部.
function sourceTabForKnowledge(item: KnowledgeItemDto): string {
  switch (item.knowledgeType) {
    case "reference":
      return "文章";
    case "transcript":
      return "视频";
    default:
      return "资料";
  }
}

/**
 * Build the REAL Research ViewModel, degrading to the fixture VM on any failure.
 *
 * @param projectId  the route segment / project id.
 * @param client     the contract client (server-bound). Injected for tests.
 */
export async function buildResearchWorkspaceViewModel(
  projectId: string,
  client: ResearchDataClient = defaultClient as unknown as ResearchDataClient,
): Promise<ResearchViewModel> {
  // [T-050] fixture VM 只剩两种用途:静态 sourceTabs 结构 + 读失败时的「未找到」壳。
  // demo 数据分支(isFixtureProject 的 trend/tag/evidence/sources/notes 注入)全部
  // 退役 —— demo 项目已从 DB 删除,真项目无数据就是空态,不再用演示内容凑数。
  const fixtureShell = buildResearchViewModel(projectId);

  let project: ProjectDto;
  try {
    project = (await client.getProject({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ProjectDto;
  } catch {
    // Unknown / unreadable project → 诚实错误态(空数据 + error 文案),不再返回
    // fixture VM(手输 demo id 会泄漏一整套演示内容)。
    return {
      scenario: "empty",
      kind: "research",
      projectId,
      idea: { title: "未找到项目", summary: "" },
      trendCards: [],
      relatedTags: [],
      sourceTabs: fixtureShell.sourceTabs,
      sources: [],
      notes: [],
      evidence: [],
      loading: false,
      error: { code: "not_found", message: "项目不存在或不可访问" },
    };
  }

  let sources: ResearchViewModel["sources"] = [];
  let notes: ResearchViewModel["notes"] = [];

  try {
    const links = (await client.listMaterialLinks({
      params: undefined,
      query: { projectId, page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<MaterialLinkDto>;

    const knowledgeLinks = links.filter(
      (link) => link.entityType === "knowledge",
    );

    const items = await Promise.all(
      knowledgeLinks.map(async (link) => {
        try {
          return (await client.getKnowledge({
            params: { knowledgeId: link.entityId },
            query: undefined,
            body: undefined,
          })) as KnowledgeItemDto;
        } catch {
          return null;
        }
      }),
    );

    const resolved = items.filter((item): item is KnowledgeItemDto => item !== null);

    // 资料收集: one ResearchSourceRow per resolved knowledge item.
    sources = resolved.map((item) => ({
      id: `source-${item.id}`,
      title: item.title,
      source: sourceTabForKnowledge(item),
      capturedAt: item.createdAt,
      tags: [],
    }));

    // 研究笔记: knowledge items whose type is "note". The note BODY lives in the
    // item's current revision — read it via knowledge.revisions.list and use the
    // head content; fall back to the item title when the body read fails or is
    // empty so a real note NEVER renders blank. Empty list ⇒ no notes (the
    // 研究笔记 island owns the empty state).
    const noteItems = resolved.filter(
      (item) => item.knowledgeType === "note",
    );
    notes = await Promise.all(
      noteItems.map(async (item) => {
        const body = await readCurrentContent(client, item.id);
        return {
          id: `note-${item.id}`,
          content: body ?? item.title,
          knowledgeId: item.id,
        };
      }),
    );
  } catch {
    // Material-links read failed — sources/notes stay empty (islands own the
    // empty state). [T-050] demo 兜底注入已退役。
  }

  return {
    scenario: "default",
    kind: "research",
    projectId: project.id,
    idea: {
      title: project.title,
      summary: project.brief || NO_BRIEF_PLACEHOLDER,
    },
    // [T-053 断点④] 趋势卡接 T-030 重建的 trend_analysis 真产物;无重建包 → 空。
    // 相关标签/证据链此波仍无真源,诚实置空([T-050] demo 注入退役)。
    trendCards: await readTrendCards(client, projectId),
    relatedTags: [],
    // The type-tab list is a static taxonomy — always the fixture's.
    sourceTabs: fixtureShell.sourceTabs,
    sources,
    notes,
    evidence: [],
    loading: false,
    error: null,
  };
}
