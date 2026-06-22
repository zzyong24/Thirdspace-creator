"use client";

/**
 * `ViewAndSortControls` is the right-aligned action bar on the Projects
 * page (SPEC §2). It is a thin composition of the shared `ViewModeToggle`
 * and `SortSelect` primitives (SPEC §7) and owns no layout beyond their
 * arrangement. Routing is intentionally left out so callers can wire each
 * control to their own router.
 */

import * as React from "react";

import { ViewModeToggle } from "@/components/navigation/view-mode-toggle";
import { SortSelect } from "@/components/navigation/sort-select";

const SORT_OPTIONS = [
  { id: "updated", label: "最近更新" },
  { id: "progress", label: "进度" },
  { id: "stage", label: "阶段" },
  { id: "title", label: "标题" },
] as const;

type View = "list" | "grid";

export interface ViewAndSortControlsProps {
  readonly defaultView?: View;
  readonly defaultSort?: (typeof SORT_OPTIONS)[number]["id"];
}

export function ViewAndSortControls({
  defaultView = "grid",
  defaultSort = "updated",
}: ViewAndSortControlsProps) {
  return (
    <div className="flex items-center justify-end gap-3">
      <ViewModeToggle defaultView={defaultView} />
      <SortSelect
        options={SORT_OPTIONS}
        defaultSort={defaultSort}
        name="projects-sort"
        ariaLabel="项目排序"
      />
    </div>
  );
}
