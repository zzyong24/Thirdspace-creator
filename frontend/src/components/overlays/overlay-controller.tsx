"use client";

/**
 * OverlayController is the single Client Component that owns the
 * `?copilot=open` overlay state (SPEC §5, D-006).
 *
 * Responsibilities:
 *  - read `?copilot=open` from the URL and render the AI Copilot panel
 *    above the AppShell,
 *  - close by removing only the `copilot` query parameter while preserving
 *    the pathname and any other approved search params,
 *  - close on Escape,
 *  - trap focus inside the panel while it is open,
 *  - restore focus to the trigger element that opened it when the panel
 *    closes.
 *
 * Pages never render the overlay directly; they only render trigger
 * elements. The Controller is mounted once at the AppShell root by the
 * `(creator)/layout.tsx`.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const OVERLAY_QUERY_KEY = "copilot";
export const OVERLAY_OPEN_VALUE = "open";
const COPILOT_DIALOG_TITLE = "AI 助手";

// ---------------------------------------------------------------------------
// Context — allows descendants to close the overlay.
// ---------------------------------------------------------------------------

interface OverlayContextValue {
  close: () => void;
  open: boolean;
}

const OverlayContext = React.createContext<OverlayContextValue | null>(null);

/**
 * Hook used by descendants of an `OverlayController` to close the overlay.
 * Throws when used outside an `OverlayController`.
 */
export function useOverlayClose(): () => void {
  const ctx = React.useContext(OverlayContext);
  if (!ctx) {
    throw new Error(
      "useOverlayClose must be used inside an <OverlayController>.",
    );
  }
  return ctx.close;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OverlayControllerProps {
  /**
   * The Copilot panel content. Renders inside the dialog when the
   * `?copilot=open` query parameter is present.
   */
  readonly children: React.ReactNode;
  /**
   * Optional className applied to the dialog panel.
   */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCopilotOpen(params: URLSearchParams): boolean {
  return params.get(OVERLAY_QUERY_KEY) === OVERLAY_OPEN_VALUE;
}

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
      // Skip elements that are explicitly hidden via `hidden` attribute
      // or `display: none` on inline style. We deliberately do NOT use
      // `offsetParent` here because jsdom returns `null` for unstyled
      // elements, which would falsely exclude visible content under test.
      if (el.hasAttribute("hidden")) return false;
      const style =
        typeof window !== "undefined" ? window.getComputedStyle(el) : null;
      if (style && style.display === "none") return false;
      if (style && style.visibility === "hidden") return false;
      return true;
    },
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OverlayController({
  children,
  className,
}: OverlayControllerProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  // Snapshot of the element that had focus when the overlay opened. We use
  // a ref so the close effect can restore focus to whatever was active at
  // the time of opening (typically the AI assistant link).
  const triggerRef = React.useRef<HTMLElement | null>(null);

  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const open = isCopilotOpen(searchParams ?? new URLSearchParams());

  const close = React.useCallback(() => {
    if (!open) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete(OVERLAY_QUERY_KEY);
    // [T-080] 深链伴生参数(surface/fn/prefill/selKind/selId)随关闭一并清掉——
    // 残留会让下次打开意外带旧预填/旧上下文,也是「关了像没关」困惑的来源。
    // [T-096] scope 同列:残留的 scope 声明会让下一个入口误落上一入口的会话桶(泄漏路径)。
    for (const k of ["surface", "fn", "prefill", "selKind", "selId", "scope"]) {
      params.delete(k);
    }
    const query = params.toString();
    const target = query.length > 0 ? `${pathname}?${query}` : pathname;
    router.replace(target, { scroll: false });
  }, [open, pathname, router, searchParams]);

  // Capture the trigger element when the overlay opens so we can restore
  // focus to it on close. Capture happens in a layout effect so we read
  // the post-commit DOM.
  React.useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    triggerRef.current =
      active instanceof HTMLElement && active !== document.body
        ? active
        : null;
  }, [open]);

  // Focus trap + Escape handler + body scroll lock while the overlay is
  // open. Restoration of focus is performed by a separate effect after the
  // overlay closes.
  React.useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    // Move initial focus into the dialog on open.
    const focusables = getFocusableElements(dialog);
    const initialTarget = focusables[0] ?? dialog;
    initialTarget.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusablesNow = getFocusableElements(dialog!);
      if (focusablesNow.length === 0) {
        event.preventDefault();
        dialog!.focus();
        return;
      }
      const first = focusablesNow[0]!;
      const last = focusablesNow[focusablesNow.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog!.contains(active)) {
        // Focus escaped the dialog — pull it back to the first focusable.
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    // Event delegation: any descendant marked with `data-overlay-close`
    // triggers the overlay close. This keeps the panel UI self-contained
    // — child components don't need access to the close function.
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const closer = target.closest("[data-overlay-close]");
      if (closer && dialog!.contains(closer)) {
        event.preventDefault();
        close();
      }
    }
    dialog.addEventListener("click", onClick);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      dialog.removeEventListener("click", onClick);
      document.body.style.overflow = previousOverflow;
      // Restore focus to the trigger that opened the overlay.
      const trigger = triggerRef.current;
      if (trigger && typeof trigger.focus === "function") {
        trigger.focus();
      }
      triggerRef.current = null;
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <OverlayContext.Provider value={{ close, open }}>
      <div
        data-slot="overlay-layer"
        data-overlay="copilot"
        className="fixed inset-0 z-overlay flex items-center justify-center p-6"
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
          aria-label={COPILOT_DIALOG_TITLE}
          tabIndex={-1}
          data-slot="overlay-panel"
          data-overlay-panel="copilot"
          className={cn(
            // bug #5:面板不再整体 overflow-y-auto(否则对话区无法 flex-1 占满 + 自身滚动)。
            // 改为 overflow-hidden + flex 列,把滚动职责交给内部各区(对话流 / 次区)。
            "relative z-10 flex h-[716px] max-h-[calc(100vh-72px)] w-full max-w-[860px] flex-col gap-3 overflow-hidden rounded-2xl bg-surface p-6 text-foreground shadow-2xl focus:outline-none",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </OverlayContext.Provider>
  );
}

export default OverlayController;
