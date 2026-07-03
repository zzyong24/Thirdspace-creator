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
  // When the page supplies a derived gallery, render its filtered+paged rows;
  // otherwise (tests) fall back to the whole view-model list.
  const allAssets = gallery?.assets ?? viewModel.assets;
  // [T-060③b] 视图切换:全部 | 按项目(项目=文件夹,点进去看该项目素材)。
  // 分组键来自 usageHistory(material_links 反查):asset ∈ 其挂过的每个项目;
  // 没挂任何项目的进「通用素材」组(素材中心直传的那批)。
  const [view, setView] = React.useState<"all" | "byProject">("all");
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
  // GAP-AST-1: an honest aria-live status line. Download / 复制链接 / 收藏 are
  // 规划中 (real object storage + a 收藏 field have no op this wave), so instead
  // of pretending a file was downloaded / a public link copied / a favorite
  // saved, the handler announces the 规划中 state. The detail-panel buttons keep
  // a 规划中 badge once that prop lands (followUp — the panel is a shared
  // component outside this lane).
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
          setActionStatus("下载失败：文件缺失或存储不可用。");
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
          const res = await fetch("/api/v1/local/reveal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as
              | { error?: string }
              | null;
            setActionStatus(`Finder 定位失败：${data?.error ?? res.status}`);
            return;
          }
          setActionStatus("已在 Finder 中显示。");
        } catch {
          setActionStatus("Finder 定位失败：本地服务不可达。");
        }
      });
    },
    [],
  );

  // E4 复制链接: GET assets.get derives a `mock://` signed URL (no real object
  // storage this wave). Best-effort clipboard write of the mock URL, but the
  // status line is honest that it is a placeholder link (规划中).
  const handleCopyLink = React.useCallback(
    (assetId: string) => {
      startTransition(async () => {
        await client.getAsset({
          params: { assetId },
          query: undefined,
          body: undefined,
        });
        try {
          await navigator.clipboard?.writeText(
            `mock://object-storage/signed/${assetId}`,
          );
        } catch {
          // No clipboard (SSR/jsdom/denied) — the op call is the wired part.
        }
        setActionStatus("公开链接规划中：已复制占位链接，真实对象存储签名链接尚未接入。");
      });
    },
    [],
  );

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
          totalCount={gallery?.totalCount ?? allAssets.length}
        />
        {/* [T-060③b] 视图切换:全部 | 按项目(文件夹)。 */}
        <div data-slot="assets-view-switch" className="flex items-center gap-1.5">
          {(
            [
              { key: "all", label: "全部" },
              { key: "byProject", label: "按项目" },
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
        {view === "byProject" && !openProjectId ? (
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
        {gallery ? (
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
          onCopyLink={handleCopyLink}
          onFavorite={handleFavorite}
          onTrash={handleTrash}
          onReveal={handleReveal}
          actionsPending={pending}
        />
        {/* GAP-AST-1: honest status line. 收藏 is REAL (persisted toggle);
            download / 复制链接 stay 规划中 — we never claim a byte download / real
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
    </div>
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

