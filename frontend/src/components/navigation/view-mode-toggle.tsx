"use client";

/**
 * `ViewModeToggle` is the shared list/grid view switch (SPEC §7,
 * "导航与筛选"). It renders two accessible `aria-pressed` buttons and is
 * reused by the Projects page and any list surface that offers a grid/list
 * choice. Routing/persistence is left to callers — the component owns only
 * the local visual state (or can be fully controlled via `value`).
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid";

export interface ViewModeToggleProps {
  readonly defaultView?: ViewMode;
  readonly value?: ViewMode;
  readonly onViewChange?: (view: ViewMode) => void;
  readonly ariaLabel?: string;
  readonly className?: string;
}

export function ViewModeToggle({
  defaultView = "grid",
  value,
  onViewChange,
  ariaLabel = "视图切换",
  className,
}: ViewModeToggleProps) {
  const [internalView, setInternalView] = React.useState<ViewMode>(defaultView);
  const view = value ?? internalView;

  const select = (next: ViewMode) => {
    if (value === undefined) setInternalView(next);
    onViewChange?.(next);
  };

  return (
    <div
      data-slot="view-toggle"
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex h-10 items-center gap-0.5 rounded-control border border-border bg-surface p-0.5",
        className,
      )}
    >
      <button
        type="button"
        data-slot="view-option"
        data-view="grid"
        aria-pressed={view === "grid"}
        aria-label="网格视图"
        onClick={() => select("grid")}
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
        onClick={() => select("list")}
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
  );
}
