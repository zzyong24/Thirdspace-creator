"use client";

/**
 * [T-130] 稿面可拖拽分栏 —— 左稿面(flex-1 自动补位)+ 右编导栏(可拖拽调宽,localStorage 持久)。
 *
 * 稿面页(draft-workbench-page)是 Server Component;把两栏容器抽成本 client 组件(slot 模式:
 * left/right 作 ReactNode,server 内容照常在服务端渲染后传入),在此管:右栏宽度 state + 拖拽
 * 分隔条(pointer 事件,col-resize)+ 键盘可调(←/→)+ 宽度持久化。左栏 flex-1 自动补位。
 * 右栏 `hidden xl:flex`(窄屏隐藏,分隔条同 `xl:block`),故拖拽只在 xl+ 生效;窄屏左栏满宽。
 */

import * as React from "react";
import { cn } from "@/lib/utils";

// 持久化键 + 边界。默认 380(与旧固定 w-[380px] 一致),拖拽/键盘钳到 [300,640]。
const RAIL_WIDTH_KEY = "creatoros:draft:rail-width";
const DEFAULT_RAIL = 380;
const MIN_RAIL = 300;
const MAX_RAIL = 640;
const KEY_STEP = 16;

function clampRail(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_RAIL;
  return Math.max(MIN_RAIL, Math.min(MAX_RAIL, Math.round(n)));
}

export function DraftResizableLayout({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  const [railWidth, setRailWidth] = React.useState<number>(DEFAULT_RAIL);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  // 挂载后读回持久宽度(SSR 默认 380,避免 hydration mismatch)。
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(RAIL_WIDTH_KEY);
      if (v) setRailWidth(clampRail(parseInt(v, 10)));
    } catch {
      /* storage 不可用 → 用默认宽 */
    }
  }, []);

  const persist = React.useCallback((w: number) => {
    try {
      window.localStorage.setItem(RAIL_WIDTH_KEY, String(w));
    } catch {
      /* 写失败(隐私模式)→ 本次会话生效不持久 */
    }
  }, []);

  const onPointerDown = React.useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom/老浏览器无 pointer capture → 拖拽仍靠 move 事件 */
    }
    document.body.style.userSelect = "none";
  }, []);

  const onPointerMove = React.useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 右栏宽 = 容器右缘 - 指针 x(拖左 → 变宽,拖右 → 变窄)。
    setRailWidth(clampRail(rect.right - e.clientX));
  }, []);

  const endDrag = React.useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      document.body.style.userSelect = "";
      setRailWidth((w) => {
        persist(w);
        return w;
      });
    },
    [persist],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      // ← 加宽右栏(分隔条左移)、→ 收窄。keyboard 可调 = a11y(拖拽不可键操的兜底)。
      let delta = 0;
      if (e.key === "ArrowLeft") delta = KEY_STEP;
      else if (e.key === "ArrowRight") delta = -KEY_STEP;
      else return;
      e.preventDefault();
      setRailWidth((w) => {
        const n = clampRail(w + delta);
        persist(n);
        return n;
      });
    },
    [persist],
  );

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <div
        data-slot="draft-pane"
        className="relative flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4"
      >
        {left}
      </div>

      {/* [T-130] 拖拽分隔条(仅 xl+ 右栏可见时 xl:block)—— pointer 拖 + 键盘 ←/→ 微调,
          role=separator + aria-valuenow/min/max 供辅助技术。 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整编导栏宽度"
        aria-valuenow={railWidth}
        aria-valuemin={MIN_RAIL}
        aria-valuemax={MAX_RAIL}
        tabIndex={0}
        data-slot="draft-rail-resize-handle"
        data-testid="draft-rail-resize-handle"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "hidden w-1.5 shrink-0 cursor-col-resize touch-none select-none bg-border/40 transition-colors",
          "hover:bg-brand/40 focus-visible:bg-brand/60 focus-visible:outline-none xl:block",
        )}
      />

      {/* 右栏:编导对话(T-055b)—— 宽度可拖拽(inline style),窄屏 hidden(左栏满宽)。 */}
      <aside
        data-slot="draft-chat-rail"
        style={{ width: railWidth }}
        className="hidden shrink-0 flex-col border-l border-border bg-surface xl:flex"
      >
        {right}
      </aside>
    </div>
  );
}
