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
import {
  OVERLAY_QUERY_KEY,
  OVERLAY_OPEN_VALUE,
} from "@/lib/overlay-constants";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
//
// `OVERLAY_QUERY_KEY` / `OVERLAY_OPEN_VALUE` 已抽到 lib/overlay-constants(无 "use client"),
// 让 server component(如 copilot-deeplink.ts)也能直接 import 拿真字面量 ——
// 不然 Next.js RSC 会把 client reference proxy 注入 URL,渲染出「点了没反应」的破 href。

const COPILOT_DIALOG_TITLE = "AI 助手";
const COPILOT_SIZE_STORAGE_KEY = "creatoros_ai_copilot_size_v1";
const COPILOT_DEFAULT_SIZE = { width: 1080, height: 800 } as const;
const COPILOT_MIN_SIZE = { width: 680, height: 560 } as const;
const COPILOT_VIEWPORT_GUTTER = 48;

interface DialogSize {
  width: number;
  height: number;
}

interface ResizeSession {
  startX: number;
  startY: number;
  startSize: DialogSize;
}

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

function getViewportLimit(): DialogSize {
  if (typeof window === "undefined") {
    return COPILOT_DEFAULT_SIZE;
  }
  return {
    width: Math.max(320, window.innerWidth - COPILOT_VIEWPORT_GUTTER),
    height: Math.max(320, window.innerHeight - COPILOT_VIEWPORT_GUTTER),
  };
}

function clampDialogSize(size: DialogSize, viewport: DialogSize): DialogSize {
  const minWidth = Math.min(COPILOT_MIN_SIZE.width, viewport.width);
  const minHeight = Math.min(COPILOT_MIN_SIZE.height, viewport.height);
  return {
    width: Math.round(Math.min(viewport.width, Math.max(minWidth, size.width))),
    height: Math.round(
      Math.min(viewport.height, Math.max(minHeight, size.height)),
    ),
  };
}

function readSavedDialogSize(): DialogSize | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COPILOT_SIZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DialogSize>;
    if (
      typeof parsed.width !== "number" ||
      !Number.isFinite(parsed.width) ||
      typeof parsed.height !== "number" ||
      !Number.isFinite(parsed.height) ||
      parsed.width <= 0 ||
      parsed.height <= 0
    ) {
      return null;
    }
    return { width: parsed.width, height: parsed.height };
  } catch {
    // 隐私模式或损坏的旧值不应阻断 AI 助手打开，安全回落到新默认尺寸。
    return null;
  }
}

function saveDialogSize(size: DialogSize): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COPILOT_SIZE_STORAGE_KEY,
      JSON.stringify(size),
    );
  } catch {
    // 本机存储不可用时，缩放仍在当前会话生效；只是不跨启动恢复。
  }
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
  const resizeSessionRef = React.useRef<ResizeSession | null>(null);
  const stopResizeRef = React.useRef<(() => void) | null>(null);
  const restoreSizeTimeoutRef = React.useRef<number | null>(null);
  const [preferredSize, setPreferredSize] = React.useState<DialogSize>(
    COPILOT_DEFAULT_SIZE,
  );
  const [viewportLimit, setViewportLimit] = React.useState<DialogSize>(
    COPILOT_DEFAULT_SIZE,
  );
  const visibleSize = React.useMemo(
    () => clampDialogSize(preferredSize, viewportLimit),
    [preferredSize, viewportLimit],
  );
  const visibleSizeRef = React.useRef(visibleSize);
  const open = isCopilotOpen(searchParams ?? new URLSearchParams());

  React.useLayoutEffect(() => {
    visibleSizeRef.current = visibleSize;
  }, [visibleSize]);

  React.useEffect(() => {
    function onWindowResize() {
      setViewportLimit(getViewportLimit());
    }
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  React.useEffect(
    () => () => {
      stopResizeRef.current?.();
    },
    [],
  );

  const beginResize = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      if (restoreSizeTimeoutRef.current !== null) {
        window.clearTimeout(restoreSizeTimeoutRef.current);
        restoreSizeTimeoutRef.current = null;
        setViewportLimit(getViewportLimit());
      }
      stopResizeRef.current?.();
      resizeSessionRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startSize: visibleSizeRef.current,
      };

      const previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      function stopResize() {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        document.body.style.userSelect = previousUserSelect;
        resizeSessionRef.current = null;
        stopResizeRef.current = null;
      }

      function onPointerMove(pointerEvent: PointerEvent) {
        const session = resizeSessionRef.current;
        if (!session) return;
        pointerEvent.preventDefault();
        // 面板始终居中，因此尺寸按指针位移的两倍变化，让右下角手柄持续跟手。
        const nextSize = clampDialogSize(
          {
            width:
              session.startSize.width +
              (pointerEvent.clientX - session.startX) * 2,
            height:
              session.startSize.height +
              (pointerEvent.clientY - session.startY) * 2,
          },
          getViewportLimit(),
        );
        visibleSizeRef.current = nextSize;
        setPreferredSize(nextSize);
      }

      function onPointerUp() {
        saveDialogSize(visibleSizeRef.current);
        stopResize();
      }

      stopResizeRef.current = stopResize;
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [],
  );

  const resizeWithKeyboard = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 64 : 32;
      const delta =
        event.key === "ArrowRight"
          ? { width: step, height: 0 }
          : event.key === "ArrowLeft"
            ? { width: -step, height: 0 }
            : event.key === "ArrowDown"
              ? { width: 0, height: step }
              : event.key === "ArrowUp"
                ? { width: 0, height: -step }
                : null;
      if (!delta) return;
      event.preventDefault();
      const nextSize = clampDialogSize(
        {
          width: visibleSizeRef.current.width + delta.width,
          height: visibleSizeRef.current.height + delta.height,
        },
        getViewportLimit(),
      );
      visibleSizeRef.current = nextSize;
      setPreferredSize(nextSize);
      saveDialogSize(nextSize);
    },
    [],
  );

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
    // 尺寸恢复会在首次布局时触发一次同步重渲染；只记录真正的外部唤起入口，
    // 不能让后续布局把它覆盖成对话框内部焦点或 body。
    if (triggerRef.current && document.contains(triggerRef.current)) return;
    const active = document.activeElement;
    triggerRef.current =
      active instanceof HTMLElement &&
      active !== document.body &&
      !dialogRef.current?.contains(active)
        ? active
        : null;
  }, [open]);

  React.useEffect(() => {
    restoreSizeTimeoutRef.current = window.setTimeout(() => {
      restoreSizeTimeoutRef.current = null;
      setViewportLimit(getViewportLimit());
      const savedSize = readSavedDialogSize();
      if (savedSize) setPreferredSize(savedSize);
    }, 0);
    return () => {
      if (restoreSizeTimeoutRef.current !== null) {
        window.clearTimeout(restoreSizeTimeoutRef.current);
        restoreSizeTimeoutRef.current = null;
      }
    };
  }, []);

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
        // 路由切换可能在 effect cleanup 之后才真正移除仍持焦的 dialog；下一帧再
        // 恢复到入口，避免浏览器的卸载聚焦把它覆盖成 body。
        window.setTimeout(() => {
          if (document.contains(trigger)) trigger.focus();
        }, 16);
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
          style={{ width: visibleSize.width, height: visibleSize.height }}
          className={cn(
            // bug #5:面板不再整体 overflow-y-auto(否则对话区无法 flex-1 占满 + 自身滚动)。
            // 改为 overflow-hidden + flex 列,把滚动职责交给内部各区(对话流 / 次区)。
            "relative z-10 flex max-h-[calc(100vh-48px)] max-w-[calc(100vw-48px)] flex-none flex-col gap-3 overflow-hidden rounded-2xl bg-surface p-6 text-foreground shadow-2xl focus:outline-none",
            className,
          )}
        >
          {children}
          <div
            role="separator"
            tabIndex={0}
            aria-label="调整 AI 助手大小"
            aria-valuetext={`${visibleSize.width} × ${visibleSize.height}`}
            data-slot="ai-copilot-resize-handle"
            title="拖拽调整窗口大小"
            onPointerDown={beginResize}
            onKeyDown={resizeWithKeyboard}
            className="group absolute bottom-0 right-0 z-20 size-8 cursor-nwse-resize touch-none select-none rounded-tl-lg outline-none focus-visible:bg-muted/70"
          >
            <span
              aria-hidden="true"
              className="absolute bottom-2 right-2 block size-3 opacity-55 transition-opacity group-hover:opacity-100"
            >
              <span className="absolute bottom-0 right-0 h-px w-3 -rotate-45 bg-muted-foreground" />
              <span className="absolute bottom-1 right-0 h-px w-2 -rotate-45 bg-muted-foreground" />
              <span className="absolute bottom-2 right-0 h-px w-1 -rotate-45 bg-muted-foreground" />
            </span>
          </div>
        </div>
      </div>
    </OverlayContext.Provider>
  );
}

export default OverlayController;
