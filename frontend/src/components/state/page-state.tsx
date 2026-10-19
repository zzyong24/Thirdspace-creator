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
  action,
  className,
}: {
  readonly title?: string;
  readonly description?: string;
  /**
   * [T-332 S4] 可选引导动作(SPEC §6.2:新号空态不是干瘪的 0,给「从零开始」的入口)。
   * 传 Link / button 等 server-safe 节点,渲染在文案下方。
   */
  readonly action?: React.ReactNode;
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
      {action ? (
        <div data-slot="page-state-empty-action" className="mt-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CrossAccountEmptyState — 深链 404(跨号 by-id)的可理解空态
// ---------------------------------------------------------------------------

/**
 * [T-332 S4] 跨号深链空态(SPEC §4.5/§6.4,spec-review minor #3 点名补进 §6.2 矩阵)。
 *
 * 账号全域隔离下,by-id 读命中别号内容 → 后端按 OwnershipError 404(与「不存在」同貌,
 * 不泄露存在性)。对用户而言这常是「切了号之后打开旧收藏链接」——裸 404 不可理解,
 * 这里给诚实解释 + 回列表动作。刻意**不做**「去 B 号查看」跳转(C-03 裁决:探测 op
 * 泄露跨号存在性,本期不做)。
 */
export function CrossAccountEmptyState({
  entityLabel = "内容",
  groupId,
  backHref,
  backLabel,
}: {
  /** 实体名(「项目」「作品」…),拼进主文案。 */
  readonly entityLabel?: string;
  readonly groupId?: string|null;
  /** 回列表深链(如 /projects)。 */
  readonly backHref: string;
  readonly backLabel: string;
}) {
  return (
    <div
      data-slot="cross-account-empty"
      data-page-state="empty"
      className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface p-10 text-center"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-full bg-surface-subtle text-base text-muted-foreground"
      >
        ∅
      </span>
      <p className="text-sm font-medium text-foreground">
        未找到该{entityLabel},或它不属于当前{groupId?"账号组":"账号"}
      </p>
      <p className="max-w-md text-[12px] text-muted-foreground">
        {groupId?`切换账号组会切换工作区。其他组的${entityLabel}在当前账号组下不可见；请在左下角进入原账号组后再打开。`:<>
        切换抖音号 = 切换整个工作区:另一个账号的{entityLabel}
        在当前账号下不可见。若这条链接来自别的账号,请先在左下角切换到对应账号后再打开。</>}
      </p>
      <a
        href={backHref}
        data-slot="cross-account-empty-back"
        className="mt-2 text-sm font-medium text-brand underline-offset-4 hover:underline"
      >
        {backLabel}
      </a>
    </div>
  );
}
