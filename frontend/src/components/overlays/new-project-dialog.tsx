"use client";

/**
 * NewProjectDialog is the intercepting-route shell for `/projects/new`
 * (SPEC §5, D-006).
 *
 * The full dialog content is implemented in a later page task. This shell
 * locks the routing contract:
 *  - the dialog renders above the AppShell with a backdrop mask,
 *  - the dialog traps focus and is closable from a Close button,
 *  - the Close button calls `router.back()` when the browser has a
 *    background entry to return to (the intercepting-route case),
 *  - when there is no background history, the Close button falls back to
 *    `router.replace('/projects')` so the dialog still closes.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

const DIALOG_TITLE = "新建项目";

export function NewProjectDialog() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);

  // We mark this render as an intercepting overlay if the user navigated
  // here from another route inside CreatorOS. The simplest reliable
  // signal is whether the browser has history entries beyond the first —
  // a direct visit (URL pasted or page refresh) leaves history.length
  // at 1, while a click-through leaves a back-entry.
  const hasBackgroundRoute = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.history.length > 1;
  }, []);

  const close = React.useCallback(() => {
    if (hasBackgroundRoute) {
      router.back();
      return;
    }

    // Direct visit — push the user back to the Projects index with no
    // leftover query params.
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("copilot");
    const query = params.toString();
    const target = query.length > 0 ? `/projects?${query}` : "/projects";
    router.replace(target, { scroll: false });
  }, [hasBackgroundRoute, router, searchParams]);

  // Initial focus + focus trap + Escape handler.
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const initial =
      closeButtonRef.current ?? getFocusableElements(dialog)[0] ?? dialog;
    initial.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getFocusableElements(dialog!);
      if (focusables.length === 0) {
        event.preventDefault();
        dialog!.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog!.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [close]);

  return (
    <div
      data-slot="overlay-layer"
      data-overlay="new-project"
      className="fixed inset-0 z-(--z-overlay) flex items-center justify-center"
    >
      <div
        aria-hidden="true"
        data-slot="overlay-mask"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={close}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={DIALOG_TITLE}
        tabIndex={-1}
        data-slot="overlay-panel"
        data-overlay-panel="new-project"
        className={cn(
          "relative z-10 flex w-full max-w-2xl flex-col gap-4 rounded-xl bg-popover p-6 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 focus:outline-none",
        )}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base font-medium">{DIALOG_TITLE}</h2>
            <p className="text-xs text-muted-foreground">
              占位内容 — 完整的新建项目表单在后续任务中实现。
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            data-slot="overlay-close"
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={close}
          >
            关闭
          </button>
        </header>
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>此处将渲染新建项目表单。</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => {
      if (el.hasAttribute("aria-hidden")) return false;
      if (el.hasAttribute("hidden")) return false;
      const style =
        typeof window !== "undefined" ? window.getComputedStyle(el) : null;
      if (style && style.display === "none") return false;
      if (style && style.visibility === "hidden") return false;
      return true;
    },
  );
}

export default NewProjectDialog;