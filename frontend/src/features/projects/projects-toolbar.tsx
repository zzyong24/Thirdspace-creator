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
}: {
  tabs: ReadonlyArray<StatusTabsBarTab>;
  status: string;
  sort: string;
}) {
  const router = useRouter();

  // 换筛选/排序回到第 1 页(结果集变了,旧页码可能越界)。
  const push = React.useCallback(
    (nextStatus: string, nextSort: string) => {
      const params = new URLSearchParams();
      if (nextStatus !== "all") params.set("status", nextStatus);
      if (nextSort !== "updated") params.set("sort", nextSort);
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
        onValueChange={(id) => push(id, sort)}
      />
      <SortSelect
        options={PROJECT_SORT_OPTIONS}
        value={sort}
        onSortChange={(id) => push(status, id)}
        name="projects-sort"
        ariaLabel="项目排序"
      />
    </div>
  );
}
