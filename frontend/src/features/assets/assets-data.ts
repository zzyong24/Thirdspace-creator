import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import {
  buildAssetsViewModel,
  buildAssetSummariesFromResources,
  type AssetListRow,
} from "@/fixtures/selectors";
import type {
  AssetSummary,
  AssetUsageRow,
  AssetsViewModel,
  StorageUsage,
} from "./assets-page";

/**
 * Assets Center READ-side data assembly ("素材中心读侧做真", GAP-AST-1).
 *
 * Assembles the REAL Assets Center ViewModel by:
 *   - `assets.list`         → the user's active asset library (already wired in
 *                              the page; centralized here). Drives the gallery
 *                              summaries + the type-filter sidebar counts.
 *   - `materialLinks.list`  → the REAL 用料历史 (usage history): per user
 *                              project, the 用料链 edges that reference an asset
 *                              (`entityType === "asset"`). This is the 「附到项目」
 *                              closing loop — an attach writes one materialLink,
 *                              and that link surfaces here as a usage row.
 *
 * What is REAL vs 规划中 (INTERACTION_SPEC GAP-AST-1 决策表):
 *   - 用料历史:    REAL via assets.usage.list (用料反查, Option B — GAP-AST). The
 *                  by-assetId reverse-lookup op returns the 用料链 edges that
 *                  reference each asset directly (no N-project walk). projects.list
 *                  is still read to resolve each edge's project title.
 *   - 存储「已用」: 弱真 — Σ of the REAL `fileSizeBytes` over the read asset
 *                  rows (a front-end aggregate, NOT a fabricated GB). The total
 *                  QUOTA has no op → a fixed cap label, flagged 规划中.
 *   - 上传字节 / 下载 / 复制链接 / 收藏: 规划中 (heavy: real object storage). The
 *                  metadata upload stays real; the byte transfer is out of scope.
 *                  Those affordances carry a 规划中 marker in the UI islands.
 *
 * Honest fallback discipline (读侧做真): per-project link reads that throw
 * contribute no usage rows; the gallery summaries fall back field-by-field to
 * the fixture builder; and a wholesale read failure (assets read throws) falls
 * back to the WHOLE fixture VM so the page never renders 崩溃/空白.
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend (mirrors publishing-center-data.ts).
 */

// Minimal structural DTOs — the contract client returns parsed resources; we
// only read the fields we map, so a narrow shape keeps the helper decoupled.
interface ProjectDto {
  readonly id: string;
  readonly title: string;
}

interface MaterialLinkDto {
  readonly id: string;
  readonly projectId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly role: string;
  readonly stage: string;
  readonly createdAt: string;
}

export interface AssetsDataClient {
  listAssets(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listProjects(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listMaterialLinks(input: {
    params: undefined;
    query: { page: number; pageSize: number; projectId: string };
    body: undefined;
  }): Promise<unknown>;
  // 用料反查 (GAP-AST usage): the by-assetId reverse lookup — which 创作 (用料链
  // edges) reference THIS asset. Replaces the N-project walk for usage history.
  listAssetUsage(input: {
    params: { assetId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

export interface ProjectOptionDto {
  readonly id: string;
  readonly title: string;
}

export interface AssetsRealData {
  /** The assembled (REAL or honest-fallback) Assets Center ViewModel. */
  readonly viewModel: AssetsViewModel;
  /** The user's projects — the 附到项目 picker source (real `projects.list`). */
  readonly projects: ReadonlyArray<ProjectOptionDto>;
}

function isoDay(iso: string): string {
  return iso.length < 10 ? iso : iso.slice(0, 10);
}

/**
 * Read the 用料链 edges that reference each asset (用料反查) and map them to
 * `AssetUsageRow`. Option B (GAP-AST): the by-assetId reverse-lookup op
 * `assets.usage.list({ assetId })` — one read per asset, no N-project walk, no
 * per-project filter. A per-asset read that throws contributes no rows (never
 * throws upward). The detail panel filters these by the selected `assetId` and
 * renders an honest 「尚未被项目引用」 empty state when none match.
 *
 * The edge carries `projectId` but not the title; we resolve the human title
 * from the `projects.list` map (falls back to the raw id when unknown).
 */
async function assembleUsageHistory(
  client: AssetsDataClient,
  assetIds: ReadonlyArray<string>,
  projects: ReadonlyArray<ProjectDto>,
): Promise<ReadonlyArray<AssetUsageRow>> {
  const projectTitleById = new Map<string, string>();
  for (const project of projects) projectTitleById.set(project.id, project.title);

  const perAsset = await Promise.all(
    assetIds.map(async (assetId) => {
      let links: ReadonlyArray<MaterialLinkDto>;
      try {
        links = (await client.listAssetUsage({
          params: { assetId },
          query: undefined,
          body: undefined,
        })) as ReadonlyArray<MaterialLinkDto>;
      } catch {
        return [] as ReadonlyArray<AssetUsageRow>;
      }
      return links.map<AssetUsageRow>((link) => ({
        id: link.id,
        assetId: link.entityId,
        projectTitle: projectTitleById.get(link.projectId) ?? link.projectId,
        // 用料链 role/stage as the human note (e.g. "clip · production").
        note: [link.role, link.stage].filter(Boolean).join(" · "),
        dateLabel: isoDay(link.createdAt),
      }));
    }),
  );

  // Newest first so the most recent usage shows at the top of the panel list.
  return perAsset
    .flat()
    .slice()
    .sort((a, b) => b.dateLabel.localeCompare(a.dateLabel));
}

/**
 * Build the REAL Assets Center ViewModel + projects picker.
 *
 * Wholesale fixture fallback survives ONLY for an outright assets-read failure
 * (the gallery is the page's core); a successful-but-empty read returns the real
 * (possibly empty) summaries so the page renders its honest 空态.
 *
 * @param client  the contract client (server-bound). Injected for tests.
 */
export async function buildAssetsViewModelReal(
  client: AssetsDataClient = defaultClient as unknown as AssetsDataClient,
): Promise<AssetsRealData> {
  // The fixture VM is the per-field + wholesale fallback baseline.
  const fixtureVm = buildAssetsViewModel();

  // --- Gallery summaries (REAL assets.list) -------------------------------
  let summaries: ReadonlyArray<AssetSummary>;
  try {
    const rows = (await client.listAssets({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<AssetListRow>;
    summaries = buildAssetSummariesFromResources(rows);
  } catch {
    // Assets read failed → the gallery is the page's core; fall back to the
    // WHOLE fixture VM (with an empty projects picker) rather than a blank page.
    return { viewModel: fixtureVm, projects: [] };
  }

  // --- Projects (REAL projects.list) — picker + usage-history walk ---------
  let projects: ReadonlyArray<ProjectDto>;
  try {
    projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<ProjectDto>;
  } catch {
    projects = [];
  }

  // --- 用料历史 (REAL materialLinks.list, Option A) -----------------------
  // A wholesale usage assembly failure degrades to the fixture usage rows
  // (per-project failures already degrade to []), so the panel never breaks.
  let usageHistory: ReadonlyArray<AssetUsageRow>;
  try {
    usageHistory = await assembleUsageHistory(
      client,
      summaries.map((s) => s.id),
      projects,
    );
  } catch {
    usageHistory = fixtureVm.usageHistory;
  }

  // --- 存储「已用」(弱真: Σ real fileSizeBytes) ----------------------------
  // 「已用」is the real sum of the read rows' fileSizeBytes (front-end aggregate,
  // not fabricated). The QUOTA total has no op → keep the fixed cap from the
  // fixture (flagged 规划中 in the spec).
  const usedBytes = summaries.reduce(
    (acc, asset) => acc + (Number.isFinite(asset.fileSizeBytes) ? asset.fileSizeBytes : 0),
    0,
  );
  const totalBytes = fixtureVm.storage.totalBytes;
  const usedLabel = `${(usedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  const storage: StorageUsage = {
    usedBytes,
    totalBytes,
    usedLabel,
    totalLabel: fixtureVm.storage.totalLabel,
  };

  // typeCounts in the VM are computed downstream by the page's deriveGallery
  // over the summaries; we pass the fixture's tone-carrying counts through (the
  // page recomputes its own real counts), keeping the VM shape stable.
  const viewModel: AssetsViewModel = {
    assets: summaries,
    typeCounts: fixtureVm.typeCounts,
    usageHistory,
    storage,
  };

  const projectOptions: ReadonlyArray<ProjectOptionDto> = projects.map((p) => ({
    id: p.id,
    title: p.title,
  }));

  return { viewModel, projects: projectOptions };
}
