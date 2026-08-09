"use client";

/**
 * `AssetsInteractiveRegion` is the Client island for the Assets Center
 * page (Task 20 / page-specs §12).
 *
 * Selection of the currently-active asset requires local UI state, so
 * the gallery (3-col grid + pagination) and the fixed right-rail
 * detail panel live together in this single Client island. The page
 * (`assets-page.tsx`) stays a Server Component.
 *
 * The island renders:
 *  - GalleryControls (view toggle + sort),
 *  - AssetCardGrid (three-column grid of AssetCard),
 *  - Pagination (page-specs §12),
 *  - AssetDetailPanel (MediaPreview + AssetActions + AssetMetadata +
 *    Tags + UsageHistory; fixed right-rail — NOT a dialog/modal).
 *
 * Determinism: every visual is rendered from props derived from
 * canonical fixtures. No `Date.now`/`Math.random`/network.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { fetchCreatorApi } from "@/lib/http-transport";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssetCard } from "@/components/resources/asset-card";
import { AssetDetailPanel } from "@/components/resources/asset-detail-panel";
import type { AssetSummary, AssetsViewModel } from "./assets-page";
// [T-381] 统一「按新旧」排序(独立模块;从 assets-page 直导会拖 server-only 链进 client)。
import { sortAssetsByNewest } from "./assets-sort";

// A project the user can attach an asset to (用料链 consumption from the library).
export interface ProjectOption {
  readonly id: string;
  readonly title: string;
}

// Plan D1: the derived gallery the page hands to the island — filtered + paged
// REAL `assets.list` rows, real paging meta, and the projects picker source.
export interface GalleryProps {
  readonly assets: ReadonlyArray<AssetSummary>;
  readonly totalCount: number;
  readonly currentPage: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly activeType: string | null;
  readonly query: string;
  readonly projects: ReadonlyArray<ProjectOption>;
}

// ---------------------------------------------------------------------------
// AssetsInteractiveRegion
// ---------------------------------------------------------------------------

interface AssetsInteractiveRegionProps {
  readonly viewModel: AssetsViewModel;
  // Optional so the unit test (which passes only `viewModel`) keeps rendering
  // the full fixture list, page 1, no filter — its DOM-shape assertions hold.
  readonly gallery?: GalleryProps;
}

export function AssetsInteractiveRegion({
  viewModel,
  gallery,
}: AssetsInteractiveRegionProps) {
  // When the page supplies a derived gallery, render its filtered+paged rows
  // (already newest-first per [T-381]); otherwise (tests) fall back to the
  // whole view-model list, sorted newest-first for the same 统一新旧序。
  const allAssets = React.useMemo(
    // 不信任上游输入顺序：服务端分页、客户端刷新和测试 seam 都在这里经过同一个
    // createdAt DESC + id ASC 规则，避免 gallery 存在时绕过排序导致每次进来顺序变化。
    () => sortAssetsByNewest(gallery?.assets ?? viewModel.assets),
    [gallery?.assets, viewModel.assets],
  );
  // [T-060③b] 视图切换:全部 | 按项目(项目=文件夹,点进去看该项目素材)。
  // 分组键来自 usageHistory(material_links 反查):asset ∈ 其挂过的每个项目;
  // 没挂任何项目的进「通用素材」组(素材中心直传的那批)。
  // [T-248 批B] 新增「回收站」视图:assets.list?status=deleted 真读的已回收素材,
  // 每项带「还原」(assets.restore)—— 补上 trash 之后看得见、回得来的闭环。
  const [view, setView] = React.useState<"all" | "byProject" | "trash">("all");
  // [T-381] 回收站同样按新旧排(统一排序纪律)。
  const trashedAssets = React.useMemo(
    () => sortAssetsByNewest(viewModel.trashedAssets ?? []),
    [viewModel.trashedAssets],
  );
  const [openProjectId, setOpenProjectId] = React.useState<string | null>(null);
  const projectGroups = React.useMemo(() => {
    const byProject = new Map<
      string,
      { title: string; assetIds: Set<string> }
    >();
    for (const row of viewModel.usageHistory) {
      const g = byProject.get(row.projectId) ?? {
        title: row.projectTitle,
        assetIds: new Set<string>(),
      };
      g.assetIds.add(row.assetId);
      byProject.set(row.projectId, g);
    }
    const linked = new Set(
      viewModel.usageHistory.map((r) => r.assetId),
    );
    const general = allAssets.filter((a) => !linked.has(a.id));
    const groups = [...byProject.entries()].map(([projectId, g]) => ({
      projectId,
      title: g.title,
      count: [...g.assetIds].filter((id) =>
        allAssets.some((a) => a.id === id),
      ).length,
      assetIds: g.assetIds,
    }));
    return { groups, generalCount: general.length, linked };
  }, [viewModel.usageHistory, allAssets]);
  const galleryAssets = React.useMemo(() => {
    if (view !== "byProject" || !openProjectId) return allAssets;
    if (openProjectId === "__general__") {
      return allAssets.filter((a) => !projectGroups.linked.has(a.id));
    }
    const g = projectGroups.groups.find((x) => x.projectId === openProjectId);
    return g ? allAssets.filter((a) => g.assetIds.has(a.id)) : allAssets;
  }, [view, openProjectId, allAssets, projectGroups]);
  const [selectedId, setSelectedId] = React.useState<string | null>(
    galleryAssets[0]?.id ?? null,
  );
  const selected =
    galleryAssets.find((asset) => asset.id === selectedId) ??
    galleryAssets[0] ??
    null;

  // Module 07 E3–E6 needs-backend detail-panel actions. Each calls its mapped
  // contract op over the typed client (→ /api/v1 dispatch → the same pglite
  // store the page reads), then router.refresh() so the gallery reflects the
  // mutation. Determinism: no Date.now/Math.random; signed URLs / object reads
  // are minted server-side by the AssetsService + MockObjectStorage.
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // GAP-AST-1: an honest aria-live status line for the wired actions.
  // [T-231③] 复制链接已改常驻 disabled + 「规划中」徽标(asset-detail-panel.tsx),
  // 不再经此状态行播报。
  const [actionStatus, setActionStatus] = React.useState<string>("");

  // E3 下载: GET assets.get confirms ownership + currentFileId, but the real
  // signed URL points at `mock://object-storage` (no byte store this wave). We
  // do NOT fabricate a download — the op call is the wired part, and the status
  // line is honest that byte download is 规划中.
  // [T-055d SPEC §7.2] 下载做真:assets.downloadUrl 换签名 GET URL(local-fs = token 门
  // blob route)→ <a download> 触发浏览器保存对话框(下载 = 复制到用户选的位置)。
  const handleDownload = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        try {
          const dto = (await client.getDownloadUrl({
            params: { assetId },
            query: undefined,
            body: undefined,
          })) as unknown as { url: string; fileName: string };
          const a = document.createElement("a");
          a.href = dto.url;
          a.download = dto.fileName || "download";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setActionStatus(`已开始下载「${dto.fileName}」。`);
        } catch {
          setActionStatus("下载失败,文件可能已被移除,请刷新后重试。");
        }
      });
    },
    [],
  );

  // [T-381] 复制地址:/api/v1/local/path 解析该 asset 的本机绝对路径(media-root+
  // storageKey,route 侧 gate-F1 三重防护)→ 写剪贴板 → 状态行「已复制」。桌面版语义:
  // 路径只在本机有意义(用途:把原图路径喂给外部 AI 生图工具)。
  const handleCopyPath = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        try {
          const res = await fetchCreatorApi("/api/v1/local/path", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId }),
          });
          if (!res.ok) {
            setActionStatus(
              res.status === 404
                ? "复制地址失败：文件已不存在或不可访问。"
                : "复制地址失败，请重试。",
            );
            return;
          }
          const data = (await res.json()) as { path?: string };
          if (!data.path) {
            setActionStatus("复制失败,请重试。");
            return;
          }
          await navigator.clipboard.writeText(data.path);
          setActionStatus("已复制文件地址。");
        } catch {
          setActionStatus("复制失败,请重试。");
        }
      });
    },
    [],
  );

  // [T-055d SPEC §7.2] 在 Finder 显示:本地 route 对安全解析后的真实文件执行 open -R
  // (gate-F1 三重路径防护在 route 侧)。
  const handleReveal = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        try {
          const res = await fetchCreatorApi("/api/v1/local/reveal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId }),
          });
          if (!res.ok) {
            // [T-133] route 的 error 是英文内部码(path rejected / unauthorized…),
            // 不直接渲给用户;按状态码给人话。dev 才留原始 error 进 console 排查。
            const data = (await res.json().catch(() => null)) as
              | { error?: string }
              | null;
            if (process.env.NODE_ENV !== "production") {
              // eslint-disable-next-line no-console
              console.error("[reveal] failed:", res.status, data?.error);
            }
            setActionStatus(
              res.status === 404
                ? "Finder 定位失败：文件已不存在或不可访问。"
                : "Finder 定位失败，请重试。",
            );
            return;
          }
          setActionStatus("已在 Finder 中显示。");
        } catch {
          setActionStatus("没能在访达中打开,请稍后重试。");
        }
      });
    },
    [],
  );

  // [T-231③] E4 复制链接:真实对象存储签名链接尚未接入,原实现往剪贴板写
  // `mock://` 死链误导用户。按钮改为常驻 disabled + 「规划中」徽标(见
  // asset-detail-panel.tsx),不再写剪贴板、不再发 assets.get。

  // E5 收藏 (Toggle favorite): REAL. POST assets.favorite.toggle flips the
  // asset's persisted isFavorite flag (replacing the old misleading
  // `assets.files.create { storageKey: favorites/... }` file-version hack), then
  // refreshes so the gallery reflects the new 收藏 state.
  const handleFavorite = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        const updated = (await client.toggleFavorite({
          params: { assetId },
          query: undefined,
          body: undefined,
        })) as { isFavorite?: boolean };
        setActionStatus(updated?.isFavorite ? "已加入收藏。" : "已取消收藏。");
        router.refresh();
      });
    },
    [router],
  );

  // E6 更多 → 移入回收站: POST assets.trash (active → deleted), then refresh so
  // the trashed asset drops out of the active gallery.
  // [T-056⑥][T-097] 危险操作确认 —— 系统级 Dialog 双按钮取代浏览器原生
  // window.confirm(全站禁原生弹窗):点「移入回收站」先记下候选 id 弹确认框,
  // 确认才执行 assets.trash,取消只关框不动数据。
  const [trashCandidateId, setTrashCandidateId] = React.useState<string | null>(
    null,
  );
  const handleTrash = React.useCallback((assetId: string) => {
    setTrashCandidateId(assetId);
  }, []);
  const handleTrashConfirm = React.useCallback(() => {
    const assetId = trashCandidateId;
    if (!assetId) return;
    setTrashCandidateId(null);
    startTransition(async () => {
      await client.trashAsset({
        params: { assetId },
        query: undefined,
        body: undefined,
      });
      router.refresh();
    });
  }, [router, trashCandidateId]);

  // [T-248 批B] 回收站还原: POST assets.restore (deleted → active),Dialog 双按钮
  // 确认门(全站禁原生 window.confirm,同 [T-097] 移入回收站模式):点「还原」先记
  // 候选 id 弹确认框,确认才执行 assets.restore + refresh(素材回到活跃库),取消只
  // 关框不动数据。
  const [restoreCandidateId, setRestoreCandidateId] = React.useState<
    string | null
  >(null);
  const handleRestore = React.useCallback((assetId: string) => {
    setRestoreCandidateId(assetId);
  }, []);
  const handleRestoreConfirm = React.useCallback(() => {
    const assetId = restoreCandidateId;
    if (!assetId) return;
    setRestoreCandidateId(null);
    startTransition(async () => {
      await client.restoreAsset({
        params: { assetId },
        query: undefined,
        body: undefined,
      });
      setActionStatus("已还原到素材库。");
      router.refresh();
    });
  }, [router, restoreCandidateId]);

  // [T-060③a] 「附到项目」退役 —— 素材只两条来路(素材中心=通用,项目内上传=项目素材)。

  return (
    <div
      data-slot="assets-interactive-region"
      className="grid grid-cols-1 gap-card-gap lg:grid-cols-[minmax(0,1fr)_312px]"
    >
      <div
        data-slot="asset-gallery"
        aria-label="素材画廊"
        className="flex flex-col gap-3"
      >
        <GalleryHeader
          totalCount={
            view === "trash"
              ? trashedAssets.length
              : gallery?.totalCount ?? allAssets.length
          }
        />
        {/* [T-060③b] 视图切换:全部 | 按项目(文件夹)| [T-248 批B] 回收站。 */}
        <div data-slot="assets-view-switch" className="flex items-center gap-1.5">
          {(
            [
              { key: "all", label: "全部" },
              { key: "byProject", label: "按项目" },
              { key: "trash", label: "回收站" },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              data-slot={`assets-view-${v.key}`}
              data-active={view === v.key}
              onClick={() => {
                setView(v.key);
                setOpenProjectId(null);
              }}
              className={
                "h-7 rounded-control px-2.5 text-xs transition-colors " +
                (view === v.key
                  ? "bg-brand text-brand-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground")
              }
            >
              {v.label}
            </button>
          ))}
          {view === "byProject" && openProjectId ? (
            <button
              type="button"
              data-slot="assets-folder-back"
              onClick={() => setOpenProjectId(null)}
              className="ml-1 text-xs text-brand underline underline-offset-2"
            >
              ← 全部项目
            </button>
          ) : null}
        </div>
        {view === "trash" ? (
          // [T-248 批B] 回收站视图:已回收素材列表,每项带「还原」确认门。
          <TrashList
            assets={trashedAssets}
            pending={pending}
            onRestore={handleRestore}
          />
        ) : view === "byProject" && !openProjectId ? (
          <div
            data-slot="assets-folder-grid"
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4"
          >
            {projectGroups.groups.map((g) => (
              <button
                key={g.projectId}
                type="button"
                data-slot="assets-folder"
                data-project-id={g.projectId}
                onClick={() => setOpenProjectId(g.projectId)}
                className="flex flex-col items-start gap-1 rounded-card border border-border bg-surface px-3 py-3 text-left transition-colors hover:border-brand/50"
              >
                <span aria-hidden="true" className="text-lg">📁</span>
                <span className="w-full truncate text-xs font-medium text-foreground">
                  {g.title}
                </span>
                <span className="text-[11px] text-text-subtle">{g.count} 件</span>
              </button>
            ))}
            <button
              type="button"
              data-slot="assets-folder"
              data-project-id="__general__"
              onClick={() => setOpenProjectId("__general__")}
              className="flex flex-col items-start gap-1 rounded-card border border-dashed border-border bg-surface-subtle/50 px-3 py-3 text-left transition-colors hover:border-brand/50"
            >
              <span aria-hidden="true" className="text-lg">🗂</span>
              <span className="text-xs font-medium text-foreground">通用素材</span>
              <span className="text-[11px] text-text-subtle">
                {projectGroups.generalCount} 件 · 未挂项目
              </span>
            </button>
          </div>
        ) : (
          <AssetCardGrid
            assets={galleryAssets}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
        )}
        {gallery && view !== "trash" ? (
          <Pagination
            currentPage={gallery.currentPage}
            totalPages={gallery.totalPages}
            pageSize={gallery.pageSize}
            activeType={gallery.activeType}
            query={gallery.query}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <AssetDetailPanel
          asset={selected}
          usageHistory={viewModel.usageHistory}
          onDownload={handleDownload}
          onCopyPath={handleCopyPath}
          onFavorite={handleFavorite}
          onTrash={handleTrash}
          onReveal={handleReveal}
          actionsPending={pending}
        />
        {/* GAP-AST-1: honest status line. 收藏 is REAL (persisted toggle);
            复制链接 已常驻 disabled 规划中 ([T-231③]) — we never claim a real
            public link succeeded. */}
        <p
          data-slot="asset-action-status"
          role="status"
          aria-live="polite"
          className={
            "px-2 text-[11px] text-muted-foreground " +
            (actionStatus ? "" : "sr-only")
          }
        >
          {actionStatus}
        </p>
      </div>
      {/* [T-097] 移入回收站确认框 —— Dialog 双按钮(确认执行/取消关闭),替代原生 confirm。 */}
      <Dialog
        open={trashCandidateId !== null}
        onOpenChange={(open) => {
          if (!open) setTrashCandidateId(null);
        }}
      >
        <DialogContent data-slot="asset-trash-confirm" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>移入回收站?</DialogTitle>
            <DialogDescription>
              确定把这份素材移入回收站?可在回收站恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-slot="asset-trash-cancel"
              onClick={() => setTrashCandidateId(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-slot="asset-trash-confirm-button"
              disabled={pending}
              onClick={handleTrashConfirm}
            >
              移入回收站
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* [T-248 批B] 还原确认框 —— Dialog 双按钮(确认执行 assets.restore/取消关闭),
          同 [T-097] 模式,全站禁原生 confirm。 */}
      <Dialog
        open={restoreCandidateId !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreCandidateId(null);
        }}
      >
        <DialogContent data-slot="asset-restore-confirm" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>还原素材?</DialogTitle>
            <DialogDescription>
              确定把这份素材从回收站还原?还原后回到素材库。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-slot="asset-restore-cancel"
              onClick={() => setRestoreCandidateId(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              data-slot="asset-restore-confirm-button"
              disabled={pending}
              onClick={handleRestoreConfirm}
            >
              还原
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TrashList — [T-248 批B] 回收站视图(已回收素材 + 还原入口)
// ---------------------------------------------------------------------------
//
// assets.list?status=deleted 真读的行。每行带「还原」按钮(先确认门再
// assets.restore)。空态诚实:「回收站是空的」,不摆假行。

function TrashList({
  assets,
  pending,
  onRestore,
}: {
  readonly assets: ReadonlyArray<AssetSummary>;
  readonly pending: boolean;
  readonly onRestore: (assetId: string) => void;
}) {
  if (assets.length === 0) {
    return (
      <p
        data-slot="assets-trash-empty"
        className="rounded-card border border-dashed border-border bg-surface-subtle/50 px-4 py-8 text-center text-sm text-muted-foreground"
      >
        回收站是空的
      </p>
    );
  }
  return (
    <ul
      data-slot="assets-trash-list"
      aria-label="回收站素材"
      className="flex flex-col gap-2"
    >
      {assets.map((asset) => (
        <li
          key={asset.id}
          data-slot="assets-trash-item"
          data-asset-id={asset.id}
          className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3 py-2.5"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-foreground">
              {asset.name}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {asset.updatedAt.slice(0, 10)}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-slot="asset-restore-button"
            data-asset-id={asset.id}
            disabled={pending}
            onClick={() => onRestore(asset.id)}
          >
            还原
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Plan D1 cleanup — removed decorative controls that had no real backing:
//   • 5 toolbar filter chips (类型/来源/项目/标签/更多) + 清除筛选 → no `assets.list`
//     param backs them. Real type filtering is the type sidebar (`?type=`).
//   • 批量操作 ▾ menu (no bulk op exists).
//   • Sidebar duplicate search field.
//   • 全选 checkbox, 网格/列表 view toggle, 排序方式 select → no backing op.
//   • The fabricated "共 12,846 个素材" count → now the REAL filtered count.
// Wired controls: toolbar search (`?q=`), type sidebar (`?type=`), real
// pagination (`?page=`/`?pageSize=`), upload (real file input), the 4 detail
// actions, card selection, and 附到项目 (materialLinks.create).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GalleryHeader — the REAL result count (no fabricated number)
// ---------------------------------------------------------------------------

function GalleryHeader({ totalCount }: { readonly totalCount: number }) {
  return (
    <div
      data-slot="gallery-controls"
      aria-label="画廊控制"
      className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
    >
      <span className="text-sm text-foreground">
        共{" "}
        <span
          data-slot="gallery-total-count"
          className="font-medium tabular-nums"
        >
          {totalCount.toLocaleString("en-US")}
        </span>{" "}
        个素材
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssetCardGrid
// ---------------------------------------------------------------------------

interface AssetCardGridProps {
  readonly assets: ReadonlyArray<AssetSummary>;
  readonly selectedId: string | null;
  readonly onSelect: (assetId: string) => void;
}

function AssetCardGrid({ assets, selectedId, onSelect }: AssetCardGridProps) {
  // [T-332 S4·§6.2] 新号零素材:诚实空态 + 指向常驻上传入口(工具栏「上传」),
  // 不渲染空网格(一片空白像坏了)。
  if (assets.length === 0) {
    return (
      <div
        data-slot="assets-gallery-empty"
        data-testid="assets-gallery-empty"
        className="flex flex-col items-center gap-1.5 rounded-card border border-dashed border-border bg-surface p-10 text-center"
      >
        <p className="text-sm font-medium text-foreground">
          这个账号还没有素材
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          素材库按抖音号隔离。用上方工具栏的「上传」放入第一批素材;采集/制作产出的封面、截图也会自动落到这里。
        </p>
      </div>
    );
  }
  return (
    <div
      data-slot="asset-card-grid"
      aria-label="素材卡片网格"
      className="grid grid-cols-1 gap-card-gap sm:grid-cols-2 lg:grid-cols-3"
    >
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={asset.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination — Plan D1: REAL `assets.list` paging via the URL `?page=`/`?pageSize=`
// query. Each control navigates `/assets?...`, the Server Component re-reads the
// list at the new page, and the gallery re-renders.
// ---------------------------------------------------------------------------

function buildAssetsHref(params: {
  page: number;
  pageSize: number;
  activeType: string | null;
  query: string;
}): string {
  const sp = new URLSearchParams();
  if (params.activeType !== null) sp.set("type", params.activeType);
  if (params.query.trim().length > 0) sp.set("q", params.query.trim());
  if (params.page > 1) sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString();
  return qs.length > 0 ? `/assets?${qs}` : "/assets";
}

const PAGE_SIZE_OPTIONS = [12, 24, 48, 60, 100] as const;

function Pagination({
  currentPage,
  totalPages,
  pageSize,
  activeType,
  query,
}: {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly pageSize: number;
  readonly activeType: string | null;
  readonly query: string;
}) {
  const router = useRouter();
  const go = React.useCallback(
    (page: number, nextPageSize: number) => {
      const clamped = Math.min(Math.max(1, page), Math.max(1, totalPages));
      router.push(
        buildAssetsHref({
          page: clamped,
          pageSize: nextPageSize,
          activeType,
          query,
        }),
      );
    },
    [router, totalPages, activeType, query],
  );

  // Render the first 4 pages, an ellipsis, and the last page so the nav stays
  // compact even when `totalPages` is large.
  const visible: Array<number | "ellipsis"> = [];
  const head = Math.min(4, totalPages);
  for (let p = 1; p <= head; p += 1) visible.push(p);
  if (totalPages > 6) {
    visible.push("ellipsis");
    visible.push(totalPages);
  } else {
    for (let p = 5; p <= totalPages; p += 1) visible.push(p);
  }

  return (
    <div
      data-slot="pagination-row"
      className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground"
    >
      <nav
        data-slot="pagination"
        aria-label="素材分页"
        className="flex items-center justify-center gap-1 text-xs"
      >
        {visible.map((entry, idx) => {
          if (entry === "ellipsis") {
            return (
              <span
                key={`ellipsis-${idx}`}
                aria-hidden="true"
                className="px-1 text-muted-foreground"
              >
                …
              </span>
            );
          }
          const isCurrent = entry === currentPage;
          return (
            <button
              key={entry}
              type="button"
              data-slot="pagination-page"
              data-page-current={isCurrent ? "true" : "false"}
              aria-current={isCurrent ? "page" : undefined}
              aria-label={`第 ${entry} 页`}
              onClick={() => go(entry, pageSize)}
              className={
                "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
                (isCurrent
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground")
              }
            >
              {entry}
            </button>
          );
        })}
        <button
          type="button"
          data-slot="pagination-next"
          aria-label="下一页"
          disabled={currentPage >= totalPages}
          onClick={() => go(currentPage + 1, pageSize)}
          className="ml-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
        >
          ›
        </button>
      </nav>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>每页</span>
        <select
          data-slot="pagination-page-size"
          value={String(pageSize)}
          aria-label="每页条数"
          onChange={(e) => go(1, Number(e.target.value))}
          className="h-7 rounded-control border border-border bg-surface px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} 条/页
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
