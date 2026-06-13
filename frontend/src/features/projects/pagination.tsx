/**
 * `Pagination` is the page navigation strip rendered below the project
 * list (SPEC §2). The page spec defines a numeric paginator with the
 * canonical layout "1, 2, 3, 4, 5, …, 10".
 *
 * This is a Server Component: it only renders the static layout. The
 * current page is highlighted; click-through routing is wired by callers
 * when needed.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export interface PaginationProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly windowSize?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  windowSize = 5,
}: PaginationProps) {
  if (totalPages <= 0) return null;
  const half = Math.max(1, Math.floor(windowSize / 2));
  const start = Math.max(1, Math.min(currentPage - half, totalPages - windowSize + 1));
  const end = Math.min(totalPages, start + windowSize - 1);
  const pages: number[] = [];
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  const showTrailingEllipsis = end < totalPages;
  return (
    <nav
      data-slot="pagination"
      aria-label="项目分页"
      className="flex items-center justify-center gap-1 pt-2 text-sm"
    >
      {pages.map((page) => {
        const isCurrent = page === currentPage;
        return (
          <button
            key={page}
            type="button"
            data-slot="pagination-page"
            data-page-current={isCurrent ? "true" : "false"}
            aria-current={isCurrent ? "page" : undefined}
            aria-label={`第 ${page} 页`}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              isCurrent
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
            )}
          >
            {page}
          </button>
        );
      })}
      {showTrailingEllipsis ? (
        <>
          <span aria-hidden="true" className="px-1 text-muted-foreground">
            …
          </span>
          <button
            type="button"
            data-slot="pagination-page"
            data-page-current="false"
            aria-label={`第 ${totalPages} 页`}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {totalPages}
          </button>
        </>
      ) : null}
    </nav>
  );
}