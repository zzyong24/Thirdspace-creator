/**
 * Shared page-state renderers (Increment 4 / functional remediation).
 *
 * Pages consume a `BasePageViewModel`-style envelope whose
 * `scenario` / `loading` / `error` fields signal the three non-default
 * states the page main content can be in:
 *
 *  - LOADING  — the data is being fetched (skeleton placeholder),
 *  - ERROR    — the selector / fetch failed (message + code),
 *  - EMPTY    — the request succeeded but there is no content.
 *
 * These are intentionally tiny, server-safe (no "use client") building
 * blocks reused across the three remediated pages so each page's state
 * rendering is consistent. They are deterministic — no `Date.now`,
 * `Math.random` or network access.
 */

import * as React from "react";

import type { ViewModelError } from "@/types/view-models";

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

/** The minimal envelope shape the page-state helpers read. */
export interface PageStateEnvelope {
  readonly scenario?: "default" | "empty" | "loading" | "error" | "selected";
  readonly loading?: boolean;
  readonly error?: ViewModelError | null;
}

export type PageStateName = "loading" | "error" | "empty" | "default";

/**
 * Resolve which state the page main content should render given the
 * ViewModel envelope plus an `isEmpty` predicate the caller computes
 * from its own collections (the page knows which collections matter).
 */
export function resolvePageState(
  envelope: PageStateEnvelope,
  isEmpty: boolean,
): PageStateName {
  if (envelope.loading || envelope.scenario === "loading") return "loading";
  if (envelope.error || envelope.scenario === "error") return "error";
  if (isEmpty || envelope.scenario === "empty") return "empty";
  return "default";
}

// ---------------------------------------------------------------------------
// LoadingState — deterministic skeleton block
// ---------------------------------------------------------------------------

export function LoadingState({
  label = "正在加载…",
  rows = 4,
  className,
}: {
  readonly label?: string;
  readonly rows?: number;
  readonly className?: string;
}) {
  return (
    <div
      data-slot="page-state-loading"
      data-page-state="loading"
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={
        "flex flex-col gap-3 rounded-card border border-border bg-surface p-4 " +
        (className ?? "")
      }
    >
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="h-4 w-40 animate-pulse rounded bg-surface-subtle"
      />
      <div aria-hidden="true" className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            data-slot="page-state-loading-row"
            className="h-10 w-full animate-pulse rounded-control bg-surface-subtle"
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorState — message + code
// ---------------------------------------------------------------------------

export function ErrorState({
  error,
  className,
}: {
  readonly error: ViewModelError | null;
  readonly className?: string;
}) {
  return (
    <div
      data-slot="page-state-error"
      data-page-state="error"
      role="alert"
      className={
        "flex flex-col items-center gap-2 rounded-card border border-danger/40 bg-danger/5 p-6 text-center " +
        (className ?? "")
      }
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-full bg-danger/10 text-base text-danger"
      >
        !
      </span>
      <p
        data-slot="page-state-error-message"
        className="text-sm font-medium text-foreground"
      >
        {error?.message ?? "加载失败，请稍后重试。"}
      </p>
      {error?.code ? (
        <p
          data-slot="page-state-error-code"
          className="font-mono text-[11px] text-muted-foreground"
        >
          {error.code}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — no content
// ---------------------------------------------------------------------------

export function EmptyState({
  title = "暂无内容",
  description,
  className,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly className?: string;
}) {
  return (
    <div
      data-slot="page-state-empty"
      data-page-state="empty"
      className={
        "flex flex-col items-center gap-1.5 rounded-card border border-dashed border-border bg-surface p-8 text-center " +
        (className ?? "")
      }
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-full bg-surface-subtle text-base text-muted-foreground"
      >
        ∅
      </span>
      <p
        data-slot="page-state-empty-title"
        className="text-sm font-medium text-foreground"
      >
        {title}
      </p>
      {description ? (
        <p className="text-[12px] text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
