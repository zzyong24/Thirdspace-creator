"use client";

/**
 * NewProjectDialog is the intercepting-route shell for `/projects/new`
 * (SPEC §5, D-006).
 *
 * The dialog owns the routing contract:
 *  - the dialog renders above the AppShell with a backdrop mask,
 *  - the dialog traps focus and is closable from a Close button,
 *  - the Close button calls `router.back()` when the browser has a
 *    background entry to return to (the intercepting-route case),
 *  - when there is no background history, the Close button falls back to
 *    `router.replace('/projects')` so the dialog still closes.
 *
 * The form body is `NewProjectForm` (Task 11). The dialog routes the
 * form's onCreate/onCancel callbacks to the routing close logic so the
 * local-success transition lands on a route change.
 */

import * as React from "react";
import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { NewProjectForm } from "@/features/projects/new-project-form";
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
      className="fixed inset-0 z-(--z-overlay) flex items-center justify-center p-6"
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
          "relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-2xl bg-popover p-5 text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/10 focus:outline-none",
        )}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-heading text-[17px] font-semibold leading-tight">{DIALOG_TITLE}</h2>
            <p className="text-xs text-muted-foreground">
              为新项目填写基础信息。后续可在工作区继续完善。
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭"
            data-slot="overlay-close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={close}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <NewProjectForm
          onCreate={() => {
            // Local success transition: collapse the dialog via the same
            // routing path as Cancel. Persistence is out of scope for
            // this task — Task 26 wires the project store. The form
            // values are intentionally not consumed here: the
            // intercepting route is a one-shot navigation back to the
            // projects list, and the project store reads the values
            // from the form state directly when the user resumes from
            // the new project entry.
            close();
          }}
          onCancel={close}
        />
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