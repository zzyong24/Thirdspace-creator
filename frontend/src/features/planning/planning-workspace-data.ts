import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildPlanningViewModel } from "@/fixtures/selectors";
import type {
  ContractCard,
  PlanningViewModel,
  ThesisNodeView,
} from "@/types/view-models";

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
 * → empty 论点树; canonical demo project → its curated fixture content).
 *
 * 关键素材 is ALSO real this wave: `materialLinks.list` (planning/research stage) fans out
 * to `assets.get` / `knowledge.get` for display names — a real project shows its real
 * linked materials, or an honest empty state when it has none. The evidence map / content
 * contract still have no producer, so they keep the existing degradation (scaffolding /
 * empty state, never fake data).
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

// A project↔(knowledge|asset) association with a role + stage. Only the entity
// pointer + stage are read here; the display name is resolved per entityType.
interface MaterialLinkDto {
  readonly entityType: "knowledge" | "asset";
  readonly entityId: string;
  readonly role: string;
  readonly stage: string;
}

interface AssetDto {
  readonly id: string;
  readonly name: string;
  readonly assetType: string;
}

interface KnowledgeItemDto {
  readonly id: string;
  readonly title: string;
  readonly knowledgeType: string;
}

type KeyMaterialView = PlanningViewModel["keyMaterials"][number];

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
  // Key-materials fan-out: the project's material-links → resolve each link's
  // display name via assets.get / knowledge.get. Optional so existing callers /
  // tests that omit them keep degrading to the fixture keyMaterials.
  listMaterialLinks?(input: {
    params: undefined;
    query: { projectId: string; page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getAsset?(input: {
    params: { assetId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  getKnowledge?(input: {
    params: { knowledgeId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

const THESIS_ARTIFACT_TYPE = "thesis_tree";
const CONTRACT_ARTIFACT_TYPE = "content_contract";
const OUTLINE_ARTIFACT_TYPE = "content_outline";

// Read the project's artifact id for `artifactType`, creating one on demand when a real
// project has none yet (so the matching planning AI node always has a write target).
// Returns null only when the artifact cannot be resolved or created (the island then hides
// the 采纳 surface). Generalized over artifactType so the 论点树/内容合同/结构方案 nodes all
// share one getOrCreate path.
async function resolveArtifactId(
  projectId: string,
  artifactType: string,
  title: string,
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
    const existing = rows.find((a) => a.artifactType === artifactType);
    if (existing) return existing.id;
    // No artifact of this type yet — create one so the AI node can append a version onto it.
    if (!client.createArtifact) return null;
    const created = (await client.createArtifact({
      params: { projectId },
      query: undefined,
      body: { title, artifactType, stage: "planning" },
    })) as ArtifactDto;
    return typeof created?.id === "string" ? created.id : null;
  } catch {
    return null;
  }
}

// Read the content_contract artifact's CURRENT version's `contentData.cards` → the four
// ContractCard view-model slots (reader side of the writer↔reader contract). Returns null
// when there is no version, no cards, or a read/parse failure (the page then keeps the
// fixture scaffolding cards).
async function loadContractCards(
  artifactId: string | null,
  client: PlanningDataClient,
): Promise<ReadonlyArray<ContractCard> | null> {
  if (!artifactId || !client.listArtifactVersions) return null;
  try {
    const versions = await client.listArtifactVersions({
      params: { artifactId },
      query: { page: 1, pageSize: 100 },
      body: undefined,
    });
    const rows = (Array.isArray(versions) ? versions : []) as ArtifactVersionDto[];
    if (rows.length === 0) return null;
    const current = rows
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber)[0];
    const rawCards = (current?.contentData as { cards?: unknown } | undefined)
      ?.cards;
    if (!Array.isArray(rawCards) || rawCards.length === 0) return null;
    const out: ContractCard[] = [];
    rawCards.forEach((raw, i) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const id = typeof o.id === "string" && o.id ? o.id : `contract-${i}`;
      const title = typeof o.title === "string" ? o.title : "";
      const body = typeof o.body === "string" ? o.body : "";
      if (!title && !body) return;
      // An AI-adopted contract card is a signed承诺 → status "approved".
      out.push({ id, title, description: body, status: "approved" });
    });
    return out.length > 0 ? out : null;
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

// The planning/research stages a key material can belong to. material-links carry a
// free-form `stage`; key materials for the 策划 workspace are the planning- + research-
// stage associations (the upstream evidence the thesis is built on).
const KEY_MATERIAL_STAGES = new Set(["planning", "research"]);

// Resolve the project's REAL key materials from `materialLinks.list` → fan out each
// link to assets.get / knowledge.get for a display name + type. Returns null on any
// read failure or when the op set is unavailable (caller falls back to the fixture /
// empty state); returns [] when the project genuinely has no in-stage links (caller
// renders the honest "暂无关键素材" empty state for a real project).
async function loadKeyMaterials(
  projectId: string,
  client: PlanningDataClient,
): Promise<ReadonlyArray<KeyMaterialView> | null> {
  if (!client.listMaterialLinks) return null;
  try {
    const listed = await client.listMaterialLinks({
      params: undefined,
      query: { projectId, page: 1, pageSize: 100 },
      body: undefined,
    });
    const links = (Array.isArray(listed) ? listed : []) as MaterialLinkDto[];
    const inStage = links.filter((l) => KEY_MATERIAL_STAGES.has(l.stage));
    const resolved = await Promise.all(
      inStage.map(async (link): Promise<KeyMaterialView | null> => {
        try {
          if (link.entityType === "asset") {
            if (!client.getAsset) return null;
            const asset = (await client.getAsset({
              params: { assetId: link.entityId },
              query: undefined,
              body: undefined,
            })) as AssetDto;
            const title = typeof asset?.name === "string" ? asset.name : "";
            if (!title) return null;
            return {
              id: `material-${link.entityId}`,
              title,
              type:
                typeof asset.assetType === "string" && asset.assetType
                  ? asset.assetType
                  : "素材",
            };
          }
          if (link.entityType === "knowledge") {
            if (!client.getKnowledge) return null;
            const item = (await client.getKnowledge({
              params: { knowledgeId: link.entityId },
              query: undefined,
              body: undefined,
            })) as KnowledgeItemDto;
            const title = typeof item?.title === "string" ? item.title : "";
            if (!title) return null;
            return {
              id: `material-${link.entityId}`,
              title,
              type:
                typeof item.knowledgeType === "string" && item.knowledgeType
                  ? item.knowledgeType
                  : "资料",
            };
          }
          return null;
        } catch {
          return null;
        }
      }),
    );
    return resolved.filter((m): m is KeyMaterialView => m !== null);
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
  // The project's content_contract artifact id — the write target the planning.contract
  // node appends onto. null when unresolved (island hidden).
  contractArtifactId: string | null;
  // The project's content_outline artifact id — the write target the planning.outline
  // node appends onto. null when unresolved (island hidden).
  outlineArtifactId: string | null;
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
    return {
      viewModel: fixture,
      thesisArtifactId: null,
      contractArtifactId: null,
      outlineArtifactId: null,
    };
  }
  if (!project || typeof project.title !== "string") {
    return {
      viewModel: fixture,
      thesisArtifactId: null,
      contractArtifactId: null,
      outlineArtifactId: null,
    };
  }

  // The fixture is rich ONLY for canonical demo projects; for an unknown id it returns the
  // 未找到 placeholder. Detect that so a REAL project surfaces honest empty states.
  const fixtureIsPlaceholder = fixture.coreThesis.title === "未找到项目";
  const brief =
    typeof project.brief === "string" && project.brief.trim().length > 0
      ? project.brief
      : "（暂无核心论点——用 AI 起草论点树后回填）";

  // Resolve the thesis_tree artifact (create on demand) + read its current 论点树.
  const thesisArtifactId = await resolveArtifactId(
    projectId,
    THESIS_ARTIFACT_TYPE,
    "论点树",
    client,
  );
  const realThesisTree = await loadThesisTree(thesisArtifactId, client);

  // Resolve the content_contract + content_outline artifacts (create on demand) so the
  // planning.contract / planning.outline nodes always have a write target. Read the
  // contract's current cards back so an adopted 内容合同 surfaces real承诺 (overriding the
  // fixture scaffolding cards).
  const contractArtifactId = await resolveArtifactId(
    projectId,
    CONTRACT_ARTIFACT_TYPE,
    "内容合同",
    client,
  );
  const outlineArtifactId = await resolveArtifactId(
    projectId,
    OUTLINE_ARTIFACT_TYPE,
    "结构方案",
    client,
  );
  const realContractCards = await loadContractCards(contractArtifactId, client);

  // 关键素材: resolve the project's real material-links (planning/research stage) →
  // asset/knowledge display names. null ⇒ read unavailable/failed (fixture fallback);
  // [] ⇒ real project with no in-stage links (honest empty state).
  const realKeyMaterials = await loadKeyMaterials(projectId, client);

  // 论点树: a real AI-drafted tree (contentData.nodes) wins; else the fixture for a
  // canonical demo project; else empty for a real non-fixture project.
  const thesisTree: ReadonlyArray<ThesisNodeView> =
    realThesisTree ?? (fixtureIsPlaceholder ? [] : fixture.thesisTree);

  // 关键素材: real material-links win (even when empty — a real project with no links
  // shows the honest empty state). Only when the read was unavailable/failed (null) do
  // we keep the fixture for a canonical demo project / empty for a real project.
  const keyMaterials: PlanningViewModel["keyMaterials"] =
    realKeyMaterials ?? (fixtureIsPlaceholder ? [] : fixture.keyMaterials);

  // 内容合同: an AI-adopted contract (contentData.cards) wins; else the fixture's 4 locked
  // scaffolding cards for a canonical demo project; else the scaffolding cards for a real
  // project (they are structural slots, not fake data — the AI fills them on 采纳).
  const contracts: ReadonlyArray<ContractCard> =
    realContractCards ?? fixture.contracts;

  return {
    viewModel: {
      ...fixture,
      projectId,
      coreThesis: {
        id: fixture.coreThesis.id || "core-thesis",
        title: project.title,
        body: brief,
      },
      // 内容合同 is real once adopted (planning.contract → content_contract artifact); until
      // then the 4 locked cards are structural scaffolding. For a real non-fixture project
      // the evidence map has no real producer yet → empty state; 关键素材 IS real
      // (material-links fan-out above), 论点树 is real once adopted.
      contracts,
      thesisTree,
      evidenceMap: fixtureIsPlaceholder ? [] : fixture.evidenceMap,
      keyMaterials,
    },
    thesisArtifactId,
    contractArtifactId,
    outlineArtifactId,
  };
}
