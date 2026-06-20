"use client";

/**
 * `ViewAndSortControls` is the right-aligned action bar that exposes the
 * list/grid view toggle and the sort radio group for the Projects page
 * (SPEC §2). The component renders both controls without inventing an
 * unapproved layout — the view toggle uses accessible `aria-pressed`
 * buttons and the sort uses a real radio group with `fieldset`/`legend`
 * semantics.
 *
 * The component is a small Client island because both controls need local
 * UI state. Routing is intentionally left out so this component stays a
 * thin shell that callers can wire to their own router.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

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
  const [view, setView] = React.useState<View>(defaultView);
  const [sort, setSort] = React.useState<string>(defaultSort);
  const currentSortLabel =
    SORT_OPTIONS.find((option) => option.id === sort)?.label ?? SORT_OPTIONS[0].label;
  return (
    <div className="flex items-center justify-end gap-3">
      <div
        data-slot="view-toggle"
        role="group"
        aria-label="视图切换"
        className="flex h-10 items-center gap-0.5 rounded-control border border-border bg-surface p-0.5"
      >
        <button
          type="button"
          data-slot="view-option"
          data-view="grid"
          aria-pressed={view === "grid"}
          aria-label="网格视图"
          onClick={() => setView("grid")}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors",
            view === "grid"
              ? "bg-brand-soft text-brand"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span aria-hidden="true">▦</span>
        </button>
        <button
          type="button"
          data-slot="view-option"
          data-view="list"
          aria-pressed={view === "list"}
          aria-label="列表视图"
          onClick={() => setView("list")}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors",
            view === "list"
              ? "bg-brand-soft text-brand"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span aria-hidden="true">☰</span>
        </button>
      </div>
      <div
        data-slot="sort-control"
        role="group"
        aria-label="项目排序"
        className="flex h-10 min-w-32 items-center justify-between gap-2 whitespace-nowrap rounded-control border border-border bg-surface px-4 text-sm"
      >
        <fieldset className="flex items-center gap-1 border-0 p-0">
          <legend className="sr-only">排序方式</legend>
          {SORT_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={cn(
                "sr-only cursor-pointer items-center gap-1 rounded-full px-2 text-xs transition-colors",
              )}
            >
              <input
                type="radio"
                name="projects-sort"
                value={option.id}
                checked={sort === option.id}
                onChange={() => setSort(option.id)}
                className="sr-only"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
        <span className="text-foreground">{currentSortLabel}</span>
        <span aria-hidden="true" className="text-muted-foreground">▾</span>
      </div>
    </div>
  );
}
