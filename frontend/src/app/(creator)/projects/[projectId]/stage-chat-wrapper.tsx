"use client";

/**
 * 阶段页编导对话常驻右栏(T-068,用户看图裁决)。
 *
 * [T-076] 项目两阶段化后仅剩 review 一个阶段子页(research/planning/publishing/
 * script 遗留路由 301 落稿面);[T-254c] production「制作视频」页复活,同样包右栏。
 * 会话与稿面同源(`project:<id>`),跨稿面/制作/复盘延续同一条编导对话,不串台不断线。
 *
 * 稿面(总览 `/projects/[id]`)与 script 子页自带右栏 → 路径不匹配时原样透传,
 * 绝不双栏。项目身份取不到(SSR 兜底/未知项目)→ 不渲右栏,诚实降级。
 * 右栏仅 xl+ 视口显示(与稿面一致),窄屏不挤压阶段工作台。
 *
 * [T-297] 编导栏可拖拽调宽(仿稿面 DraftResizableLayout):pointer 拖分隔条 + 键盘 ←/→ 微调
 * + localStorage 持久,钳到 [300,640]。**默认宽 = 最大 640**(用户要「默认就是编导对话能拖到
 * 的最左/最大宽」)。稿面走 content-fill(内部滚动)故用 DraftResizableLayout;本阶段页是整页
 * 滚动 + sticky 右栏,不改滚动上下文,只把 aside 宽度做成可拖(容器 ref 量 right - 指针 x)。
 */

import * as React from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { DraftChatRail } from "@/features/draft-workbench/draft-chat-rail";

const STAGE_SEGMENTS = /\/projects\/[^/]+\/(review|production)(\/|$)/;

// [T-297] 阶段编导栏宽度:独立持久键(不与稿面 creatoros:draft:rail-width 串味);
// 默认 = 最大 640(与稿面 MAX_RAIL 对齐);拖拽/键盘钳到 [300,640]。
const RAIL_WIDTH_KEY = "creatoros:stage:rail-width";
const DEFAULT_RAIL = 640;
const MIN_RAIL = 300;
const MAX_RAIL = 640;
const KEY_STEP = 16;

function clampRail(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_RAIL;
  return Math.max(MIN_RAIL, Math.min(MAX_RAIL, Math.round(n)));
}

export function StageChatWrapper({
  projectId,
  projectTitle,
  children,
}: {
  readonly projectId: string | null;
  readonly projectTitle: string | null;
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isStagePage = STAGE_SEGMENTS.test(pathname);

  // Hooks 必须无条件调用(早返回在其后)。SSR 默认 640,挂载后读回持久宽度(避免 hydration 闪)。
  const [railWidth, setRailWidth] = React.useState<number>(DEFAULT_RAIL);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);

  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(RAIL_WIDTH_KEY);
      if (v) setRailWidth(clampRail(parseInt(v, 10)));
    } catch {
      /* storage 不可用 → 用默认宽(最大 640) */
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
      /* jsdom/老浏览器无 pointer capture → 靠 move 事件 */
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
      // ← 加宽右栏(分隔条左移)、→ 收窄。键盘可调 = a11y(拖拽不可键操的兜底)。
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

  if (!isStagePage || !projectId || !projectTitle) return <>{children}</>;

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 items-stretch gap-0"
    >
      <div className="min-w-0 flex-1">{children}</div>

      {/* [T-297] 拖拽分隔条(pointer 拖 + 键盘 ←/→,role=separator);仅 xl+ 右栏可见时显示。 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整编导栏宽度"
        aria-valuenow={railWidth}
        aria-valuemin={MIN_RAIL}
        aria-valuemax={MAX_RAIL}
        tabIndex={0}
        data-slot="stage-rail-resize-handle"
        data-testid="stage-rail-resize-handle"
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

      <aside
        data-slot="stage-chat-rail"
        style={{ width: railWidth }}
        className="hidden shrink-0 border-l border-border bg-surface xl:block"
      >
        <div className="sticky top-0 h-[calc(100vh-4rem)]">
          <DraftChatRail projectId={projectId} projectTitle={projectTitle} />
        </div>
      </aside>
    </div>
  );
}
