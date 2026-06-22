import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildPlanningViewModel } from "@/fixtures/selectors";
import type { PlanningViewModel, ThesisNodeView } from "@/types/view-models";

/**
 * 策划工作台读侧做真 — assemble a REAL `PlanningViewModel` so a real/newly-created
 * project never renders the fixture selector's "未找到项目" empty state. Mirrors the
 * verified `research-workspace-data.ts` pattern: an injectable client (defaults to the
 * server client), per-field fixture fallback, whole-VM fallback on any read failure.
 *
 * Real this wave: the project identity (`coreThesis` title/body from the real project's
 * title + brief) AND the 论点树 — the planning.thesis AI node (planning-runner.ts) WRITES a
 * `thesis_tree` artifact version whose `contentData.nodes` this helper reads back. When the
 * project's thesis_tree artifact has a current version carrying non-empty `nodes`, those
 * override the fixture `thesisTree`; otherwise the surface degrades honestly (real project
 * → empty 论点树; canonical demo project → its curated fixture content). The evidence
 * map / key materials still have no producer, so they keep the existing degradation.
 *
 * `thesisArtifactId` is resolved (and created on demand for a real project that has none
 * yet) so the planning UI can pass it to the planning.thesis node as the write target.
 * It is threaded via the page → island prop (NOT added as a required VM field — keeps the
 * existing planning-workspace-page tests untouched).
 */

interface ProjectDto {
  readonly id: string;
  readonly title: string;
  readonly brief: string;
}

interface ArtifactDto {
  readonly id: string;
  readonly artifactType: string;
  readonly currentVersionId?: string | null;
}

interface ArtifactVersionDto {
  readonly id: string;
  readonly versionNumber: number;
  readonly contentData?: Record<string, unknown> | null;
}

export interface PlanningDataClient {
  getProject(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listArtifacts?(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  createArtifact?(input: {
    params: { projectId: string };
    query: undefined;
    body: { title: string; artifactType: string; stage: string };
  }): Promise<unknown>;
  listArtifactVersions?(input: {
    params: { artifactId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

const THESIS_ARTIFACT_TYPE = "thesis_tree";

// Read the project's `thesis_tree` artifact id, creating one on demand when a real project
// has none yet (so the planning.thesis node always has a write target). Returns null only
// when the artifact cannot be resolved or created (the island then hides the 采纳 surface).
async function resolveThesisArtifactId(
  projectId: string,
  client: PlanningDataClient,
): Promise<string | null> {
  if (!client.listArtifacts) return null;
  try {
    const listed = await client.listArtifacts({
      params: { projectId },
      query: { page: 1, pageSize: 200 },
      body: undefined,
    });
    const rows = (Array.isArray(listed) ? listed : []) as ArtifactDto[];
    const existing = rows.find((a) => a.artifactType === THESIS_ARTIFACT_TYPE);
    if (existing) return existing.id;
    // No thesis_tree artifact yet — create one so the AI node can append a version onto it.
    if (!client.createArtifact) return null;
    const created = (await client.createArtifact({
      params: { projectId },
      query: undefined,
      body: {
        title: "论点树",
        artifactType: THESIS_ARTIFACT_TYPE,
        stage: "planning",
      },
    })) as ArtifactDto;
    return typeof created?.id === "string" ? created.id : null;
  } catch {
    return null;
  }
}

// Read the thesis_tree artifact's CURRENT version's `contentData.nodes` → ThesisNodeView[]
// (reader side of the writer↔reader contract; assigns stable ids `thesis-<i>`). Returns
// null when there is no version, no nodes, or a read/parse failure (the page then keeps
// the fixture fallback).
async function loadThesisTree(
  artifactId: string | null,
  client: PlanningDataClient,
): Promise<ThesisNodeView[] | null> {
  if (!artifactId || !client.listArtifactVersions) return null;
  try {
    const versions = await client.listArtifactVersions({
      params: { artifactId },
      query: { page: 1, pageSize: 100 },
      body: undefined,
    });
    const rows = (Array.isArray(versions) ? versions : []) as ArtifactVersionDto[];
    if (rows.length === 0) return null;
    // The 采纳 path appends an immutable version; pick the highest versionNumber as current.
    const current = rows
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
    const rawNodes = (current?.contentData as { nodes?: unknown } | undefined)
      ?.nodes;
    if (!Array.isArray(rawNodes) || rawNodes.length === 0) return null;
    const out: ThesisNodeView[] = [];
    rawNodes.forEach((raw, i) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const column = o.column;
      if (
        column !== "core" &&
        column !== "support" &&
        column !== "evidence" &&
        column !== "counter"
      ) {
        return;
      }
      const title = typeof o.title === "string" ? o.title : "";
      const summary = typeof o.summary === "string" ? o.summary : "";
      if (!title && !summary) return;
      out.push({ id: `thesis-${i}`, column, title, summary });
    });
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export interface PlanningWorkspaceData {
  viewModel: PlanningViewModel;
  // The project's thesis_tree artifact id — the write target the planning.thesis node
  // appends a new ArtifactVersion onto. null when it could not be resolved/created (the
  // island then hides the 采纳 surface).
  thesisArtifactId: string | null;
}

export async function buildPlanningWorkspaceViewModel(
  projectId: string,
  client: PlanningDataClient = defaultClient as unknown as PlanningDataClient,
): Promise<PlanningWorkspaceData> {
  const fixture = buildPlanningViewModel(projectId);

  let project: ProjectDto | null = null;
  try {
    project = (await client.getProject({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ProjectDto;
  } catch {
    // Unknown / cross-user / unreadable project → keep the fixture VM (preserves the
    // "未找到项目" empty-state for genuinely invalid ids).
    return { viewModel: fixture, thesisArtifactId: null };
  }
  if (!project || typeof project.title !== "string") {
    return { viewModel: fixture, thesisArtifactId: null };
  }

  // The fixture is rich ONLY for canonical demo projects; for an unknown id it returns the
  // 未找到 placeholder. Detect that so a REAL project surfaces honest empty states.
  const fixtureIsPlaceholder = fixture.coreThesis.title === "未找到项目";
  const brief =
    typeof project.brief === "string" && project.brief.trim().length > 0
      ? project.brief
      : "（暂无核心论点——用 AI 起草论点树后回填）";

  // Resolve the thesis_tree artifact (create on demand) + read its current 论点树.
  const thesisArtifactId = await resolveThesisArtifactId(projectId, client);
  const realThesisTree = await loadThesisTree(thesisArtifactId, client);

  // 论点树: a real AI-drafted tree (contentData.nodes) wins; else the fixture for a
  // canonical demo project; else empty for a real non-fixture project.
  const thesisTree: ReadonlyArray<ThesisNodeView> =
    realThesisTree ?? (fixtureIsPlaceholder ? [] : fixture.thesisTree);

  return {
    viewModel: {
      ...fixture,
      projectId,
      coreThesis: {
        id: fixture.coreThesis.id || "core-thesis",
        title: project.title,
        body: brief,
      },
      // Keep the 4 locked content-contract cards (structural scaffolding). For a real
      // non-fixture project, the evidence map / key materials have no real producer yet →
      // empty states, not placeholder fixture content.
      contracts: fixture.contracts,
      thesisTree,
      evidenceMap: fixtureIsPlaceholder ? [] : fixture.evidenceMap,
      keyMaterials: fixtureIsPlaceholder ? [] : fixture.keyMaterials,
    },
    thesisArtifactId,
  };
}
