import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildProductionViewModel } from "@/fixtures/selectors";
import type { ProductionAsset, ProductionViewModel } from "@/types/view-models";

/**
 * Production Workspace READ-side data assembly ("制作工作台读侧做真").
 *
 * Assembles a REAL `ProductionViewModel` for the route from the (few) data
 * sources that actually land in the Production stage today:
 *
 *   - `projects.outputs.list` + `outputs.production.get` → the project's
 *     production record, whose `productionMode` drives the VM `mode`.
 *   - `materialLinks.list({ projectId })` filtered to `entityType:"asset"`
 *     (the AI 素材匹配 / material.match node creates these "已配素材" links) →
 *     resolved via `assets.get` into the `assets` library grid.
 *
 * Degrades gracefully PER FIELD: a real project that resolves but has no matched
 * assets renders an EMPTY asset grid (the AssetLibraryPanel owns the empty
 * state) instead of fixture thumbnails. Everything WITHOUT a real read path this
 * wave — `scriptLines`, `preview`, `timeline`, `settings`, `assetCategories` —
 * is kept from the fixture VM only for the canonical demo projects, and EMPTY /
 * static-taxonomy for real projects so cards show their honest empty state
 * rather than fake data. There is no real landing for the NLE timeline / preview
 * / recording-settings, so we do NOT fabricate them.
 *
 * If the project's production record can't be resolved at all, the whole VM
 * falls back to the fixture builder (preserving the old behavior for unknown
 * ids). A REAL project must NEVER render "未找到项目".
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend.
 */

// Minimal structural DTOs — the contract client returns parsed resources; we
// only read the fields we map, so a narrow shape keeps the helper decoupled.
interface ProjectIdDto {
  readonly id: string;
}

interface OutputDto {
  readonly id: string;
}

interface ProductionDto {
  readonly id: string;
  readonly productionMode: "remote_recording" | "screen_capture" | "studio";
  readonly status: "drafting" | "recording" | "editing" | "rendering" | "ready";
}

interface MaterialLinkDto {
  readonly entityType: "knowledge" | "asset";
  readonly entityId: string;
  readonly role: string;
  readonly stage: string;
}

interface AssetDto {
  readonly id: string;
  readonly name: string;
  readonly assetType: "image" | "video" | "audio" | "document" | "subtitle";
  readonly currentFileId: string;
}

export interface ProductionDataClient {
  listProjects(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listAssets(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listOutputs(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  getOutputProduction(input: {
    params: { outputId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listMaterialLinks(input: {
    params: undefined;
    query: { projectId: string; page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getAsset(input: {
    params: { assetId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

// Slug → canonical project id, resolved against the REAL persisted project list
// (projects.list). Mirrors the route's resolveProjectId so material-links /
// outputs reads (keyed by canonical id) resolve when the route arrives via slug.
async function resolveProjectId(
  client: ProductionDataClient,
  slug: string,
): Promise<string> {
  if (!slug) return slug;
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<ProjectIdDto>;
    const ids = projects.map((p) => p.id);
    if (ids.includes(slug)) return slug;
    const candidate = `project-${slug.replace(/-/g, "")}`;
    return ids.includes(candidate) ? candidate : slug;
  } catch {
    return slug;
  }
}

// The project's primary ContentOutput — prefer a `*-main` output, else the
// first output owned by the project. Returns null when the project has none.
async function resolvePrimaryOutputId(
  client: ProductionDataClient,
  projectId: string,
): Promise<string | null> {
  try {
    const outputs = (await client.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<OutputDto>;
    if (outputs.length === 0) return null;
    const main = outputs.find((o) => o.id.endsWith("-main"));
    return (main ?? outputs[0]!).id;
  } catch {
    return null;
  }
}

/**
 * REAL whole-library asset count for the 素材库「全部」stat (GAP-PRD-1 AC1).
 *
 * Reads ONE large page of `assets.list` (same source as the Assets 中心) and
 * returns its length. The previous panel used a fabricated `assets.length*20+8`
 * formula; this replaces it with the honest library size. Returns `undefined`
 * on any read failure so the panel degrades to the matched-asset count rather
 * than a wrong number.
 */
export async function countAssetLibrary(
  client: ProductionDataClient = defaultClient as unknown as ProductionDataClient,
): Promise<number | undefined> {
  try {
    const rows = (await client.listAssets({
      params: undefined,
      query: { page: 1, pageSize: 500 },
      body: undefined,
    })) as ReadonlyArray<unknown>;
    return rows.length;
  } catch {
    return undefined;
  }
}

function mapAssetType(type: string): ProductionAsset["type"] {
  switch (type) {
    case "video":
      return "video";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "subtitle":
      return "subtitle";
    default:
      return "document";
  }
}

/**
 * Build the REAL Production ViewModel, degrading to the fixture VM when the
 * project's production record cannot be resolved at all.
 *
 * @param projectId  the route segment / project id (slug).
 * @param client     the contract client (server-bound). Injected for tests.
 */
export async function buildProductionWorkspaceViewModel(
  projectId: string,
  client: ProductionDataClient = defaultClient as unknown as ProductionDataClient,
): Promise<ProductionViewModel> {
  // The fixture VM is the per-field fallback source for everything that has no
  // real read path this wave, and the WHOLE fallback if production is unresolved.
  const fixtureVm = buildProductionViewModel(projectId);

  // Resolve the project's production record (mode/status). Without a resolvable
  // output → production, there is no real production state to show, so keep the
  // old fixture behavior (which renders the empty/demo production as before).
  const canonicalProjectId = await resolveProjectId(client, projectId);
  const outputId = await resolvePrimaryOutputId(client, canonicalProjectId);
  if (outputId === null) {
    return fixtureVm;
  }

  let production: ProductionDto;
  try {
    production = (await client.getOutputProduction({
      params: { outputId },
      query: undefined,
      body: undefined,
    })) as ProductionDto;
  } catch {
    // Production unresolved (e.g. unseeded project) → fixture fallback. A real
    // project still won't render "未找到项目" — the fixture's empty production
    // state is the honest degraded render.
    return fixtureVm;
  }

  // A canonical/demo project keeps the fixture's curated script/preview/timeline
  // content; a real project shows empty states (no fake NLE data).
  const isFixtureProject = fixtureVm.scenario !== "empty";

  // 已配素材 — the asset-type material links the AI 素材匹配 (material.match) node
  // created for this project, resolved into the asset library grid. Real for
  // every project; empty (honest) when nothing has been matched yet.
  let assets: ReadonlyArray<ProductionAsset> = [];
  try {
    const links = (await client.listMaterialLinks({
      params: undefined,
      query: { projectId: canonicalProjectId, page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<MaterialLinkDto>;

    const assetLinks = links.filter((link) => link.entityType === "asset");

    const resolved = await Promise.all(
      assetLinks.map(async (link) => {
        try {
          return (await client.getAsset({
            params: { assetId: link.entityId },
            query: undefined,
            body: undefined,
          })) as AssetDto;
        } catch {
          return null;
        }
      }),
    );

    assets = resolved
      .filter((asset): asset is AssetDto => asset !== null)
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        type: mapAssetType(asset.assetType),
        // No asset-file read op this wave → no real duration/dimension label.
        durationLabel: null,
      }));
  } catch {
    // Material-links read failed — keep assets empty (real project) or fall back
    // to the fixture library (canonical demo project) so the grid still renders.
    if (isFixtureProject) {
      assets = fixtureVm.assets;
    }
  }

  return {
    scenario: "default",
    kind: "production",
    projectId: fixtureVm.projectId,
    // REAL: the project's persisted production mode.
    mode: production.productionMode,
    // No real script-line read path here (the script lives in the Script stage);
    // fixture content for demo projects, EMPTY for real projects.
    scriptLines: isFixtureProject ? fixtureVm.scriptLines : [],
    // Static taxonomy — always the fixture's category tabs.
    assetCategories: fixtureVm.assetCategories,
    // REAL: matched assets (已配素材) for ALL projects; empty when none matched.
    assets,
    // No real preview render this wave — fixture for demo, neutral empty label
    // for real projects (the PreviewPanel renders the placeholder either way).
    preview: isFixtureProject
      ? fixtureVm.preview
      : { posterLabel: "暂无预览", durationLabel: "00:00" },
    // Recording/subtitle/export settings have no real per-project read path —
    // keep the static fixture descriptors so the SettingsRail renders.
    settings: fixtureVm.settings,
    // No real timeline landing (NLE not implemented) — fixture for demo,
    // EMPTY for real projects so the strip shows its empty state.
    timeline: isFixtureProject ? fixtureVm.timeline : [],
    loading: false,
    error: null,
  };
}
