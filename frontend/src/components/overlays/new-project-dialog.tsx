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
import { usePathname, useRouter } from "next/navigation";

import { NewProjectForm } from "@/features/projects/new-project-form";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";

const DIALOG_TITLE = "新建项目";

export function NewProjectDialog() {
  const router = useRouter();
  // Render only while the route is actually /projects/new. The dialog lives
  // in the `@modal` parallel slot; after `onCreate` navigates to a workspace,
  // the modal slot can briefly linger on a soft navigation, so this gate
  // ensures the dialog disappears the moment the route changes.
  const pathname = usePathname();
  const isActiveRoute = pathname === "/projects/new";

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

    // Direct visit — push the user back to the Projects index, preserving
    // any non-copilot query params on the address bar. We read the URL
    // straight from `window.location.search` (instead of `useSearchParams`)
    // so the dialog does not have to live inside a Next.js Suspense
    // boundary and does not retrigger RSC streaming on mount.
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    params.delete("copilot");
    const query = params.toString();
    const target = query.length > 0 ? `/projects?${query}` : "/projects";
    router.replace(target, { scroll: false });
  }, [hasBackgroundRoute, router]);

  // Initial focus + focus trap + Escape handler.
  React.useEffect(() => {
    if (!isActiveRoute) return;

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
  }, [close, isActiveRoute]);

  if (!isActiveRoute) {
    return null;
  }

  return (
    <div
      data-slot="overlay-layer"
      data-overlay="new-project"
      className="fixed inset-0 z-overlay flex items-center justify-center p-6"
    >
      <div
        aria-hidden="true"
        data-slot="overlay-mask"
        className="absolute inset-0 bg-black/15 backdrop-blur-[1px]"
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
          // [T-056④] 高度随内容:固定 860px 是裁宪前 5 字段的尺寸,字段减少后留白过多。
          "relative z-10 flex max-h-[calc(100vh-72px)] w-full max-w-[640px] flex-col gap-3.5 overflow-y-auto rounded-2xl bg-popover px-6 py-5 text-[13px] text-popover-foreground shadow-2xl ring-1 ring-foreground/10 focus:outline-none",
        )}
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-heading text-xl font-semibold leading-tight">
              {DIALOG_TITLE}　<span className="text-brand">✦</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              从一个想法开始，AI 将陪你完成从研究到发布的全过程
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
          onCreate={async (values) => {
            // Island -> client.* -> store mutation. createProject appends a
            // project to the mock store and returns it with its seeded
            // `*-mock-*` id. We navigate to the *returned* id's research
            // workspace (not a slug guess), so the new row resolves on arrival.
            const created = await client.createProject({
              params: undefined,
              query: undefined,
              // [T-052 裁决④] 宪法 §8:不再提交 contentType/targetPlatforms
              // (project_target_platforms 停写,平台归属发布层);画幅(横竖屏)
              // 作为唯一形态区分落 briefDetail.orientation。
              body: {
                title: values.name,
                brief: values.brief,
                briefDetail: { orientation: values.orientation, targetPlatforms: [] },
                creationMode: values.creationMode,
              },
            });
            // Invalidate the App Router cache so /projects re-reads from SQL on
            // return (otherwise the cached pre-create list hides the new row).
            router.refresh();
            if (values.enterAfterCreate) {
              // [T-055a] 阶段路由已退役,创建后直达稿面工作台。
              router.replace(`/projects/${created.id}`, {
                scroll: false,
              });
              return;
            }
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
