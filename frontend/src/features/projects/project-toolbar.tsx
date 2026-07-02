"use client";

/**
 * `ProjectToolbar` is the global action strip rendered above the project
 * list (SPEC §2). It owns three slots:
 *  - SearchField — a debounced text input,
 *  - FilterButton — a static button (filter dialog is part of a later task),
 *  - NewProjectButton — a Link to `/projects/new` so the intercepting
 *    modal from Task 8 opens.
 *
 * The component is a small Client island because the search field needs
 * local UI state. The new-project entry remains a Server-rendered Link
 * via `next/link`.
 */

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface ProjectToolbarProps {
  readonly placeholder?: string;
  readonly defaultValue?: string;
}

export function ProjectToolbar({
  placeholder = "搜索项目名称、关键词…",
  defaultValue = "",
}: ProjectToolbarProps) {
  const [value, setValue] = React.useState(defaultValue);
  return (
    <div
      data-slot="projects-toolbar"
      aria-label="项目工具栏"
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div
        data-slot="search-field"
        className="flex h-10 w-full min-w-0 flex-1 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm sm:max-w-md"
      >
        <span aria-hidden="true" className="text-muted-foreground">
          🔎
        </span>
        <input
          type="search"
          aria-label="搜索项目"
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-slot="filter-button"
          aria-label="筛选项目"
          className="inline-flex h-10 items-center gap-1.5 rounded-control border border-border bg-surface px-3 text-sm text-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span aria-hidden="true">⚙</span>
          <span>筛选</span>
        </button>
        <Link
          href="/projects/new"
          data-slot="new-project-button"
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-control bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          )}
        >
          <span aria-hidden="true">＋</span>
          <span>新建项目</span>
        </Link>
      </div>
    </div>
  );
}