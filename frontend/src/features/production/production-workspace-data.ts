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
  // SEAM-03:读本项目脚本 artifact → 当前版本 → 分镜行,喂拍摄阶段提词。
  listArtifacts(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getArtifact(input: {
    params: { artifactId: string };
    query: undefined;
    body: undefined;
  }): Promise<{ currentVersionId?: unknown }>;
  listArtifactVersions(input: {
    params: { artifactId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

// SEAM-03 助手:读项目的脚本 artifact 当前版本 → 提词行(脚本阶段写的真分镜流进拍摄)。
// 任何读/解析失败 → 空数组(降级,绝不崩)。
async function readScriptLines(
  client: ProductionDataClient,
  projectId: string,
): Promise<ProductionViewModel["scriptLines"]> {
  try {
    const artifacts = (await client.listArtifacts({
      params: { projectId },
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<{ id: string; artifactType: string }>;
    const SCRIPT_TYPES = new Set(["output_script", "master_script", "script"]);
    const scriptArtifact = (Array.isArray(artifacts) ? artifacts : []).find(
      (a) => SCRIPT_TYPES.has(a.artifactType),
    );
    if (!scriptArtifact) return [];
    const meta = await client.getArtifact({
      params: { artifactId: scriptArtifact.id },
      query: undefined,
      body: undefined,
    });
    const versions = (await client.listArtifactVersions({
      params: { artifactId: scriptArtifact.id },
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<{
      id: string;
      versionNumber: number;
      contentData?: { sections?: unknown };
    }>;
    const rows = Array.isArray(versions) ? versions : [];
    const current =
      rows.find((v) => v.id === meta.currentVersionId) ??
      rows.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
    const sections = Array.isArray(current?.contentData?.sections)
      ? (current!.contentData!.sections as Array<Record<string, unknown>>)
      : [];
    const fmt = (s: unknown) =>
      typeof s === "number" && Number.isFinite(s)
        ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
        : "";
    return sections
      .map((sec, i) => {
        const id = typeof sec.id === "string" ? sec.id : `script-line-${i}`;
        const body = typeof sec.body === "string" ? sec.body : "";
        const heading = typeof sec.heading === "string" ? sec.heading : "";
        const text = body || heading;
        if (!text) return null;
        const start = fmt(sec.startSeconds);
        const end = fmt(sec.endSeconds);
        const timestamp = start ? (end ? `${start} – ${end}` : start) : "";
        return { id, text, timestamp };
      })
      .filter((l): l is { id: string; text: string; timestamp: string } =>
        Boolean(l),
      );
  } catch {
    return [];
  }
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
  // [T-050] fixture VM 只剩静态结构来源(素材分类 tabs/设置描述符);demo 数据分支
  // (isFixtureProject 的 scriptLines/assets/preview/timeline 注入)与整 VM 回退全部
  // 退役 —— demo 项目已从 DB 删除,制作未开始/读失败渲染诚实空,不再演示内容凑数。
  const fixtureShell = buildProductionViewModel(projectId);
  const emptyVm = (): ProductionViewModel => ({
    scenario: "default",
    kind: "production",
    projectId,
    mode: "remote_recording",
    scriptLines: [],
    assetCategories: fixtureShell.assetCategories,
    assets: [],
    preview: { posterLabel: "暂无预览", durationLabel: "00:00" },
    settings: fixtureShell.settings,
    timeline: [],
    loading: false,
    error: null,
  });

  // Resolve the project's production record (mode/status). Without a resolvable
  // output → production, there is no real production state to show → honest
  // empty production (制作尚未开始).
  const canonicalProjectId = await resolveProjectId(client, projectId);
  const outputId = await resolvePrimaryOutputId(client, canonicalProjectId);
  if (outputId === null) {
    return emptyVm();
  }

  let production: ProductionDto;
  try {
    production = (await client.getOutputProduction({
      params: { outputId },
      query: undefined,
      body: undefined,
    })) as ProductionDto;
  } catch {
    // Production unresolved → honest empty production state.
    return emptyVm();
  }

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
    // Material-links read failed — assets stay empty (the grid owns the empty
    // state). [T-050] demo 素材库兜底注入已退役。
  }

  // SEAM-03:读脚本阶段写的真分镜当提词。真脚本优先;无则诚实空。
  const realScriptLines = await readScriptLines(client, canonicalProjectId);

  return {
    scenario: "default",
    kind: "production",
    projectId,
    // REAL: the project's persisted production mode.
    mode: production.productionMode,
    // SEAM-03:脚本阶段持久化的真分镜 → 拍摄提词;无则空([T-050] demo 提词退役)。
    scriptLines: realScriptLines,
    // Static taxonomy — always the fixture's category tabs.
    assetCategories: fixtureShell.assetCategories,
    // REAL: matched assets (已配素材) for ALL projects; empty when none matched.
    assets,
    // No real preview render this wave — neutral empty label (the PreviewPanel
    // renders the placeholder).
    preview: { posterLabel: "暂无预览", durationLabel: "00:00" },
    // Recording/subtitle/export settings have no real per-project read path —
    // keep the static fixture descriptors so the SettingsRail renders.
    settings: fixtureShell.settings,
    // No real timeline landing (NLE not implemented) — honest empty strip.
    timeline: [],
    loading: false,
    error: null,
  };
}
