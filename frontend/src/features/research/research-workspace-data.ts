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
 * material renders empty `sources`/`notes` (the islands own the empty state),
 * and the non-real fields (`trendCards`, `competitors`, `relatedTags`) are kept
 * from the fixture VM only for the canonical demo projects — EMPTY for real /
 * non-fixture projects so cards show their empty state instead of fake data.
 *
 * If the project READ throws/404s, the whole VM falls back to the fixture
 * builder (preserving the old behavior for unknown ids). A REAL project must
 * NEVER render "未找到项目".
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
  // The fixture VM is the per-field fallback source for everything that has no
  // real read path this wave, and the WHOLE fallback if the project read fails.
  const fixtureVm = buildResearchViewModel(projectId);

  let project: ProjectDto;
  try {
    project = (await client.getProject({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ProjectDto;
  } catch {
    // Unknown / unreadable project → preserve old behavior (fixture VM, which
    // renders "未找到项目" for ids absent from the canonical dataset).
    return fixtureVm;
  }

  // A canonical/demo project keeps the fixture's curated trend/competitor/tag
  // content; a real project shows empty states (no fake data).
  const isFixtureProject = fixtureVm.scenario !== "empty";

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
    // Material-links read failed — keep sources/notes empty (real project) or
    // fall back to fixture content (canonical demo project).
    if (isFixtureProject) {
      sources = fixtureVm.sources;
      notes = fixtureVm.notes;
    }
  }

  return {
    scenario: "default",
    kind: "research",
    projectId: project.id,
    idea: {
      title: project.title,
      summary: project.brief || NO_BRIEF_PLACEHOLDER,
    },
    // No real source this wave — fixture content for demo projects, EMPTY for
    // real projects so the cards render their empty states.
    trendCards: isFixtureProject ? fixtureVm.trendCards : [],
    competitors: isFixtureProject ? fixtureVm.competitors : [],
    relatedTags: isFixtureProject ? fixtureVm.relatedTags : [],
    // The type-tab list is a static taxonomy — always the fixture's.
    sourceTabs: fixtureVm.sourceTabs,
    sources,
    notes,
    // Evidence has no real source/role link this wave — keep it honest: fixture
    // content for demo projects, empty for real projects.
    evidence: isFixtureProject ? fixtureVm.evidence : [],
    loading: false,
    error: null,
  };
}
