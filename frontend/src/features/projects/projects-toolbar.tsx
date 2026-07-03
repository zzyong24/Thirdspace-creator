"use client";

/**
 * [T-051 2b] 项目列表工具条 —— 状态 tab + 排序真接线(URL 驱动)。
 *
 * 旧三件套是「视觉先行」假交互:tab 高亮不筛行、排序选中不排、视图切换永远列表。
 * 铁律「真实有效或删除」:
 *   - 状态 tab / 排序 → 落 URL search params(?status=&sort=),server 端据此
 *     筛选 + 排序 + 分页(计数仍取全量,筛选不歪 tab 徽标);
 *   - 视图切换(list/grid)→ 砍:全仓没有 grid 渲染实现,保留即假承诺。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { StatusTabsBar, type StatusTabsBarTab } from "./status-tabs-bar";
import { SortSelect } from "@/components/navigation/sort-select";

export const PROJECT_SORT_OPTIONS = [
  { id: "updated", label: "最近更新" },
  { id: "progress", label: "进度" },
  { id: "stage", label: "阶段" },
  { id: "title", label: "标题" },
] as const;

export type ProjectSortId = (typeof PROJECT_SORT_OPTIONS)[number]["id"];

export function ProjectsToolbar({
  tabs,
  status,
  sort,
  showHidden = false,
  hiddenCount = 0,
}: {
  tabs: ReadonlyArray<StatusTabsBarTab>;
  status: string;
  sort: string;
  /** [T-073] 是否显示平台侧已隐藏的作品(URL ?hidden=1 驱动)。 */
  showHidden?: boolean;
  /** [T-073] 已隐藏作品数(徽标计数;为 0 时不渲染开关,避免无意义控件)。 */
  hiddenCount?: number;
}) {
  const router = useRouter();

  // 换筛选/排序/显隐回到第 1 页(结果集变了,旧页码可能越界)。
  const push = React.useCallback(
    (nextStatus: string, nextSort: string, nextShowHidden: boolean) => {
      const params = new URLSearchParams();
      if (nextStatus !== "all") params.set("status", nextStatus);
      if (nextSort !== "updated") params.set("sort", nextSort);
      if (nextShowHidden) params.set("hidden", "1");
      const qs = params.toString();
      router.push(qs ? `/projects?${qs}` : "/projects");
    },
    [router],
  );

  return (
    <div
      data-slot="projects-controls-row"
      className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
    >
      <StatusTabsBar
        tabs={tabs}
        value={status}
        onValueChange={(id) => push(id, sort, showHidden)}
      />
      <div className="flex items-center gap-2">
        {/* [T-073] 显示已隐藏开关:抖音端「仅自己可见/已隐藏」的作品默认过滤;
            有隐藏作品(或开关已打开)时才渲染。 */}
        {hiddenCount > 0 || showHidden ? (
          <button
            type="button"
            data-slot="projects-show-hidden-toggle"
            aria-pressed={showHidden}
            onClick={() => push(status, sort, !showHidden)}
            className={
              showHidden
                ? "inline-flex h-8 items-center gap-1 rounded-full border border-brand/60 bg-brand-soft px-3 text-xs font-medium text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                : "inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface px-3 text-xs text-muted-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            }
          >
            <span>{showHidden ? "隐藏已隐藏作品" : "显示已隐藏作品"}</span>
            {hiddenCount > 0 ? (
              <span className="font-mono text-[10px] tabular-nums">
                {hiddenCount}
              </span>
            ) : null}
          </button>
        ) : null}
        <SortSelect
          options={PROJECT_SORT_OPTIONS}
          value={sort}
          onSortChange={(id) => push(status, id, showHidden)}
          name="projects-sort"
          ariaLabel="项目排序"
        />
      </div>
    </div>
  );
}
