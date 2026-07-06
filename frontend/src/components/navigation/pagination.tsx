/**
 * `Pagination` is the shared page navigation strip (SPEC §7, "导航与筛选").
 * The page spec defines a numeric paginator with the canonical layout
 * "1, 2, 3, …, N".
 *
 * This is a Server Component: it only renders the static layout. The
 * current page is highlighted; click-through routing is wired by callers
 * when needed. The summary/per-page labels are caller-supplied so the
 * component carries no page-specific copy.
 */

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface PaginationProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly windowSize?: number;
  readonly totalLabel?: string;
  readonly perPageLabel?: string;
  /**
   * When provided, the page controls become navigating `<Link>`s to
   * `hrefForPage(n)` (e.g. `/projects?page=2`). Omitted → inert `<button>`s
   * (the legacy visual-only baseline; existing callers + tests unchanged).
   */
  readonly hrefForPage?: (page: number) => string;
}

export function Pagination({
  currentPage,
  totalPages,
  windowSize = 5,
  totalLabel = "共 28 个项目",
  perPageLabel = "每页显示 10 条",
  hrefForPage,
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
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  // One control = a Link (when hrefForPage is set and the target is enabled) or
  // an inert button (legacy baseline / disabled edges). Keeps every data-slot +
  // aria attribute identical so existing tests still match.
  const Ctrl = ({
    page,
    slot,
    ariaLabel,
    className,
    disabled,
    current,
    children,
  }: {
    page: number;
    slot: string;
    ariaLabel: string;
    className: string;
    disabled?: boolean;
    current?: boolean;
    children: React.ReactNode;
  }) => {
    const attrs = {
      "data-slot": slot,
      "aria-label": ariaLabel,
      className,
      ...(current !== undefined
        ? {
            "data-page-current": current ? "true" : "false",
            "aria-current": current ? ("page" as const) : undefined,
          }
        : {}),
    };
    if (hrefForPage && !disabled) {
      return (
        <Link href={hrefForPage(page)} {...attrs}>
          {children}
        </Link>
      );
    }
    return (
      <button type="button" disabled={disabled} {...attrs}>
        {children}
      </button>
    );
  };

  return (
    <div className="flex items-center justify-between gap-4 pt-2 text-sm">
      <span className="text-xs text-muted-foreground">{totalLabel}</span>
      <nav
        data-slot="pagination"
        aria-label="项目分页"
        className="flex items-center gap-1"
      >
        <Ctrl
          page={currentPage - 1}
          slot="pagination-prev"
          ariaLabel="上一页"
          disabled={!hasPrev}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">‹</span>
        </Ctrl>
        {pages.map((page) => {
          const isCurrent = page === currentPage;
          return (
            <Ctrl
              key={page}
              page={page}
              slot="pagination-page"
              current={isCurrent}
              ariaLabel={`第 ${page} 页`}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                isCurrent
                  ? // [UI] 当前页:不用满饱和实心紫圆(太重),改柔紫底 + 品牌色字 + 细描边 —— 清晰"当前"但克制。
                    "bg-brand-soft font-semibold text-brand ring-1 ring-inset ring-brand/30"
                  : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
              )}
            >
              {page}
            </Ctrl>
          );
        })}
        {showTrailingEllipsis ? (
          <>
            <span aria-hidden="true" className="px-1 text-muted-foreground">
              …
            </span>
            <Ctrl
              page={totalPages}
              slot="pagination-page"
              current={false}
              ariaLabel={`第 ${totalPages} 页`}
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-muted-foreground hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {totalPages}
            </Ctrl>
          </>
        ) : null}
        <Ctrl
          page={currentPage + 1}
          slot="pagination-next"
          ariaLabel="下一页"
          disabled={!hasNext}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true">›</span>
        </Ctrl>
      </nav>
      <span className="text-xs text-muted-foreground">{perPageLabel}</span>
    </div>
  );
}
