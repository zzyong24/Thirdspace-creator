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
import type { ViewModelError } from "@/types/view-models";

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
 * Honest tri-state discipline (读侧做真, GAP-AST-tristate): the gallery read
 * (assets.list) is the page's core and drives the tri-state outcome —
 *   - read SUCCEEDS, rows present → real summaries,
 *   - read SUCCEEDS, no rows      → real EMPTY list → honest 空态 (NOT the
 *                                    fixture gallery; a fresh empty account must
 *                                    see its own emptiness, not user-zyongzhu's
 *                                    seed),
 *   - read FAILS                  → `state: "error"` so the route renders an
 *                                    error state. We DO NOT fall back to the
 *                                    whole fixture VM on a real read failure —
 *                                    dressing a failure as fake data is the bug
 *                                    this lane removes.
 * Secondary reads (projects, per-asset usage) stay independently guarded: a
 * failure there contributes no rows but never downgrades the gallery to error.
 * The storage QUOTA cap (totalLabel) has no op → a fixed planning label, and
 * 已用 is the 弱真 Σ of the REAL read bytes (not fabricated).
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend (mirrors publishing-center-data.ts). The route
 * production path passes a session-scoped client so reads are ctx.userId-scoped.
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
  /**
   * Tri-state read outcome of the gallery read (assets.list):
   *   - "ready" → the read succeeded; `viewModel.assets` is the REAL list,
   *               which may legitimately be empty (honest 空态).
   *   - "error" → the read FAILED; the route renders an error state. The VM is
   *               an empty placeholder (NOT a fabricated fixture VM) — we refuse
   *               to dress a read failure as if it were real, empty data.
   */
  readonly state: "ready" | "error";
  /** The error payload when `state === "error"` (drives the page error state). */
  readonly error?: ViewModelError;
  /** The assembled REAL Assets Center ViewModel (empty placeholder on error). */
  readonly viewModel: AssetsViewModel;
  /** The user's projects — the 附到项目 picker source (real `projects.list`). */
  readonly projects: ReadonlyArray<ProjectOptionDto>;
}

/**
 * An empty Assets VM placeholder used for the error tri-state. It carries NO
 * fabricated assets/usage rows — the storage card keeps the planning quota cap
 * (totalLabel, which has no op) but reports zero 已用. We never reuse the
 * fixture gallery for an error: a read failure must not masquerade as data.
 */
function emptyAssetsViewModel(): AssetsViewModel {
  const fixtureVm = buildAssetsViewModel();
  return {
    assets: [],
    typeCounts: fixtureVm.typeCounts,
    usageHistory: [],
    storage: {
      usedBytes: 0,
      totalBytes: fixtureVm.storage.totalBytes,
      usedLabel: "0.00 GB",
      totalLabel: fixtureVm.storage.totalLabel,
    },
  };
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
        projectId: link.projectId,
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
 * Build the REAL Assets Center ViewModel + projects picker, tri-state.
 *
 * A successful read returns the REAL (possibly empty) summaries so the page
 * renders its honest 空态; a read FAILURE returns `state: "error"` with an empty
 * placeholder VM so the route renders an error state. There is NO wholesale
 * fixture fallback on a real read failure — that anti-pattern (dressing a
 * failure as fake seed data) is removed in this lane.
 *
 * @param client  the contract client (server-bound, session-scoped on the
 *                route production path). Injected for tests.
 */
export async function buildAssetsViewModelReal(
  client: AssetsDataClient = defaultClient as unknown as AssetsDataClient,
): Promise<AssetsRealData> {
  // --- Gallery summaries (REAL assets.list) -------------------------------
  let summaries: ReadonlyArray<AssetSummary>;
  try {
    const rows = (await client.listAssets({
      params: undefined,
      query: { page: 1, pageSize: 200 },
      body: undefined,
    })) as unknown as ReadonlyArray<AssetListRow>;
    summaries = buildAssetSummariesFromResources(rows);
  } catch (err) {
    // Assets read FAILED → honest error tri-state. We do NOT fabricate a
    // fixture gallery: the route renders an error state instead of fake data.
    return {
      state: "error",
      error: {
        code: "assets_read_failed",
        message: err instanceof Error ? err.message : "素材库读取失败",
      },
      viewModel: emptyAssetsViewModel(),
      projects: [],
    };
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

  // --- 用料历史 (REAL assets.usage.list, Option B) ------------------------
  // The gallery read already succeeded, so usage is a SECONDARY read: a
  // wholesale assembly failure degrades to NO rows (honest empty 用料历史),
  // never to fabricated fixture rows. Per-asset failures already degrade to [].
  let usageHistory: ReadonlyArray<AssetUsageRow>;
  try {
    usageHistory = await assembleUsageHistory(
      client,
      summaries.map((s) => s.id),
      projects,
    );
  } catch {
    usageHistory = [];
  }

  // --- 存储「已用」(弱真: Σ real fileSizeBytes) ----------------------------
  // 「已用」is the real sum of the read rows' fileSizeBytes (front-end aggregate,
  // not fabricated). The QUOTA total has no op → keep the fixed cap from the
  // fixture (flagged 规划中 in the spec).
  const usedBytes = summaries.reduce(
    (acc, asset) => acc + (Number.isFinite(asset.fileSizeBytes) ? asset.fileSizeBytes : 0),
    0,
  );
  // The storage QUOTA cap has no read op → keep the fixed planning label from
  // the fixture (flagged 规划中 in the spec). This is a static cap LABEL, not
  // fabricated usage data: 已用 above is the 弱真 Σ of the REAL read bytes.
  const fixtureStorage = buildAssetsViewModel().storage;
  const totalBytes = fixtureStorage.totalBytes;
  const usedLabel = `${(usedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  const storage: StorageUsage = {
    usedBytes,
    totalBytes,
    usedLabel,
    totalLabel: fixtureStorage.totalLabel,
  };

  // typeCounts in the VM are computed downstream by the page's deriveGallery
  // over the summaries; we pass the fixture's tone-carrying counts through (the
  // page recomputes its own real counts), keeping the VM shape stable.
  const viewModel: AssetsViewModel = {
    assets: summaries,
    typeCounts: buildAssetsViewModel().typeCounts,
    usageHistory,
    storage,
  };

  const projectOptions: ReadonlyArray<ProjectOptionDto> = projects.map((p) => ({
    id: p.id,
    title: p.title,
  }));

  return { state: "ready", viewModel, projects: projectOptions };
}
