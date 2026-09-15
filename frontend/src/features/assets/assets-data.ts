import "server-only";

import { describeUserError } from "@/lib/ai-error-humanize";
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
import { collectAllPages } from "@/lib/complete-pagination";

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
 *   - 用料历史: REAL via materialLinks.list，按页批量读取当前用户关联，
 *                  仅映射当前账号画廊内素材；projects.list 解析项目标题。
 *   - 存储 (已用 + 容量): [T-115] REAL via settings.storage.get — 与设置页 /
 *                  sidebar 卡同一真实源。usedBytes = Σ asset_files.file_size,
 *                  totalBytes = rootPath 所在磁盘真实容量 (fs.statfs)。不再用前端自算 Σ、
 *                  不再用 fixture 50GB 假 cap;读失败诚实降级 (used 0 / 无分母)。
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
 * Secondary reads (projects, usage history, storage) stay independently
 * guarded: a failure there contributes no rows but never downgrades the gallery
 * to error. [T-115] 存储 used/total 均取 settings.storage.get 真值 (与设置页一致);
 * 该读失败仅降级存储块 (used 0 / 无分母),不影响画廊三态。
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
    // [T-248 批B] status 可选:缺省 active(画廊);"deleted" = 回收站视图读。
    query: { page: number; pageSize: number; status?: "active" | "deleted" };
    body: undefined;
  }): Promise<unknown>;
  listProjects(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listMaterialLinks(input: {
    params: undefined;
    query: { page: number; pageSize: number; projectId?: string };
    body: undefined;
  }): Promise<unknown>;
  // 用料反查 (GAP-AST usage): the by-assetId reverse lookup — which 创作 (用料链
  // edges) reference THIS asset. Replaces the N-project walk for usage history.
  listAssetUsage(input: {
    params: { assetId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  // [T-115] 存储用量真实源 (settings.storage.get):与设置页 / sidebar 卡同一 op。
  // 返回真实 usedBytes(Σ asset_files.file_size)+ totalBytes(rootPath 所在磁盘容量,
  // fs.statfs;未知为 0)。素材页 StorageUsageCard 由此接真实磁盘容量,不再用 fixture 50GB cap。
  getStorage(input: {
    params: undefined;
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
 * fabricated assets/usage rows. [T-115] The storage block is also honest: no
 * fixture 50GB cap — a failed page reports 已用 0 GB with no fake 分母 (totalBytes
 * 0 → totalLabel 空串). We never reuse the fixture gallery for an error: a read
 * failure must not masquerade as data.
 */
function emptyAssetsViewModel(): AssetsViewModel {
  const fixtureVm = buildAssetsViewModel();
  return {
    assets: [],
    typeCounts: fixtureVm.typeCounts,
    usageHistory: [],
    trashedAssets: [],
    storage: {
      usedBytes: 0,
      totalBytes: 0,
      usedLabel: "0 MB",
      totalLabel: "",
    },
  };
}

function isoDay(iso: string): string {
  return iso.length < 10 ? iso : iso.slice(0, 10);
}

/**
 * 复用已归属校验的 materialLinks.list，避免逐素材调用挤满本地服务。
 * 只显示当前画廊素材的关联；单个素材详情仍可使用 assets.usage.list。
 */
async function assembleUsageHistory(
  client: AssetsDataClient,
  assetIds: ReadonlyArray<string>,
  projects: ReadonlyArray<ProjectDto>,
): Promise<ReadonlyArray<AssetUsageRow>> {
  if (assetIds.length === 0) return [];
  const projectTitleById = new Map(projects.map((project) => [project.id, project.title]));
  const currentAssetIds = new Set(assetIds);
  const links = await collectAllPages<MaterialLinkDto>({
    pageSize: 100,
    getKey: (link) => link.id,
    fetchPage: async (page, pageSize) =>
      (await client.listMaterialLinks({
        params: undefined, query: { page, pageSize }, body: undefined,
      })) as ReadonlyArray<MaterialLinkDto>,
  });
  // SEMANTIC_BOUNDARY_ALLOW: 真实资源类型和归属ID过滤，不做素材创作匹配或选择。
  return links
    .filter((link) => link.entityType === "asset" && currentAssetIds.has(link.entityId))
    .map<AssetUsageRow>((link) => ({
      id: link.id,
      assetId: link.entityId,
      projectId: link.projectId,
      projectTitle: projectTitleById.get(link.projectId) ?? link.projectId,
      note: [link.role, link.stage].filter(Boolean).join(" · "),
      dateLabel: isoDay(link.createdAt),
    }))
    .sort((a, b) => b.dateLabel.localeCompare(a.dateLabel));
}

/**
 * 存储用量组装 (T-115) — 读真实 `settings.storage.get`,与设置页 / sidebar 卡同一真实源。
 *
 * used / total 都取 getStorage 真值(usedBytes = Σ asset_files.file_size,totalBytes =
 * rootPath 所在磁盘真实容量,fs.statfs;未知为 0)。读失败或形状不对 → 诚实降级:
 * used=0 / total=0 / totalLabel 空串(不回退 fixture 50GB 假 cap)。GB 显示统一到设置页 /
 * sidebar 卡的 `/1e9` 1 位小数口径(bytes/1e9,toFixed(1)),三处显同一数字(如
 * 0.1 GB / 494.4 GB);totalBytes>0 时给 totalLabel,否则空串(StorageUsageCard 据空
 * totalLabel 只显「已用 X GB」不摆假分母)。
 */
async function assembleStorage(client: AssetsDataClient): Promise<StorageUsage> {
  // [T-360①] 自适应单位:此前死绑 GB 一位小数,几 MB 真实用量显示「0.0 GB」被用户判为
  // 统计 bug(后端 usedBytes 其实有值)。<1GB 显 MB、<1MB 显 KB,不再抹成 0。三处同款
  // (settings gb() / sidebar-storage-card)一并改。
  const gib = (bytes: number): string => {
    if (bytes >= 1_000_000_000) return (bytes / 1_000_000_000).toFixed(1) + " GB";
    if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + " MB";
    if (bytes > 0) return Math.max(1, Math.round(bytes / 1_000)) + " KB";
    return "0 MB";
  };
  try {
    const s = (await client.getStorage({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as { usedBytes?: unknown; totalBytes?: unknown };
    const usedBytes =
      typeof s.usedBytes === "number" && Number.isFinite(s.usedBytes)
        ? s.usedBytes
        : NaN;
    const totalBytes =
      typeof s.totalBytes === "number" && Number.isFinite(s.totalBytes)
        ? s.totalBytes
        : NaN;
    if (!Number.isFinite(usedBytes)) {
      // 读到但 used 形状不对 → 诚实降级,不拼半真值。
      return { usedBytes: 0, totalBytes: 0, usedLabel: gib(0), totalLabel: "" };
    }
    const total = Number.isFinite(totalBytes) ? totalBytes : 0;
    return {
      usedBytes,
      totalBytes: total,
      usedLabel: gib(usedBytes),
      // 真实磁盘容量已知才给分母 label;未知(0)→ 空串 → 卡只显已用。
      totalLabel: total > 0 ? gib(total) : "",
    };
  } catch {
    // transport race / 读失败 → 诚实降级为「已用 0 GB」,绝不回退 fixture 假 cap。
    return { usedBytes: 0, totalBytes: 0, usedLabel: gib(0), totalLabel: "" };
  }
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
    const rows = await collectAllPages<AssetListRow>({
      pageSize: 200,
      getKey: (row) => row.id,
      fetchPage: async (page, pageSize) =>
        (await client.listAssets({
          params: undefined,
          query: { page, pageSize },
          body: undefined,
        })) as ReadonlyArray<AssetListRow>,
    });
    summaries = buildAssetSummariesFromResources(rows);
  } catch (err) {
    // Assets read FAILED → honest error tri-state. We do NOT fabricate a
    // fixture gallery: the route renders an error state instead of fake data.
    return {
      state: "error",
      error: {
        code: "assets_read_failed",
        message: describeUserError(err, "素材库读取失败，请稍后重试。"),
      },
      viewModel: emptyAssetsViewModel(),
      projects: [],
    };
  }

  // --- 回收站 (REAL assets.list?status=deleted, T-248 批B) ------------------
  // 已回收素材的读侧配套:没有它,素材进了回收站就再也看不见、无处还原。SECONDARY
  // read:失败只降级为空回收站(画廊三态不受影响),绝不编造行。
  let trashedAssets: ReadonlyArray<AssetSummary>;
  try {
    const trashedRows = await collectAllPages<AssetListRow>({
      pageSize: 200,
      getKey: (row) => row.id,
      fetchPage: async (page, pageSize) =>
        (await client.listAssets({
          params: undefined,
          query: { page, pageSize, status: "deleted" },
          body: undefined,
        })) as ReadonlyArray<AssetListRow>,
    });
    trashedAssets = buildAssetSummariesFromResources(trashedRows);
  } catch {
    trashedAssets = [];
  }

  // --- Projects (REAL projects.list) — picker + usage-history walk ---------
  let projects: ReadonlyArray<ProjectDto>;
  try {
    projects = await collectAllPages<ProjectDto>({
      pageSize: 100,
      getKey: (row) => row.id,
      fetchPage: async (page, pageSize) =>
        (await client.listProjects({
          params: undefined,
          query: { page, pageSize },
          body: undefined,
        })) as ReadonlyArray<ProjectDto>,
    });
  } catch {
    projects = [];
  }

  // --- 用料历史 (REAL materialLinks.list，批量读取) ------------------------
  // The gallery read already succeeded, so usage is a SECONDARY read: a
  // wholesale assembly failure degrades to NO rows (honest empty 用料历史),
  // never to fabricated fixture rows.
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

  // --- 存储 (真实源: settings.storage.get, T-115) --------------------------
  // 统一口径:与设置页 / sidebar 卡同一真实源。usedBytes / totalBytes 直接取 getStorage
  // 真值(usedBytes = Σ asset_files.file_size,totalBytes = 真实磁盘容量),不再用前端自算 Σ
  // (避免两处 used 有细微差)、不再用 fixture 50GB cap。读失败诚实降级:used=0、totalBytes=0
  // (让进度条以 used 为 max)、totalLabel 空串(素材页只显「已用 X GB」不带假分母),绝不回退假值。
  const storage = await assembleStorage(client);

  // typeCounts in the VM are computed downstream by the page's deriveGallery
  // over the summaries; we pass the fixture's tone-carrying counts through (the
  // page recomputes its own real counts), keeping the VM shape stable.
  const viewModel: AssetsViewModel = {
    assets: summaries,
    typeCounts: buildAssetsViewModel().typeCounts,
    usageHistory,
    storage,
    trashedAssets,
  };

  const projectOptions: ReadonlyArray<ProjectOptionDto> = projects.map((p) => ({
    id: p.id,
    title: p.title,
  }));

  return { state: "ready", viewModel, projects: projectOptions };
}
