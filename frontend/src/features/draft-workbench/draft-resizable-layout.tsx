"use client";

/**
 * [T-130] 稿面可拖拽分栏 —— 左稿面(flex-1 自动补位)+ 右编导栏(可拖拽调宽,localStorage 持久)。
 *
 * 稿面页(draft-workbench-page)是 Server Component;把两栏容器抽成本 client 组件(slot 模式:
 * left/right 作 ReactNode,server 内容照常在服务端渲染后传入),在此管:右栏宽度 state + 拖拽
 * 分隔条(pointer 事件,col-resize)+ 键盘可调(←/→)+ 宽度持久化。左栏 flex-1 自动补位。
 * 宽屏沿原拖拽分栏；窄窗使用同一 right 实例的本地编导面板，稿面保持满宽。
 *
 * [T-150] 右栏可折叠 —— 用户反馈右栏「常驻关不掉」,想全宽看稿面。加 `collapsed` 状态
 * (localStorage 持久,默认展开不改 T-055b 常驻默认):收起 → 右栏 + 拖拽手柄隐藏、左稿面
 * 满宽、最右露一条细竖条 affordance 可点展开;展开恢复到之前持久的宽度(不丢 T-130 记忆)。
 * 关键边界:本组件在 DraftChatRequestProvider 内,监听 request.nonce —— 收起态来了新 request
 * (审核/搜素材/盲预测)自动展开右栏,否则结果喂进隐藏 rail 就丢了。
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDraftChatRequest } from "./draft-chat-request";

// 持久化键 + 边界。默认 380(与旧固定 w-[380px] 一致),拖拽/键盘钳到 [300,640]。
const RAIL_WIDTH_KEY = "creatoros:draft:rail-width";
// [T-150] 折叠态持久化键。存 "1"=收起 / "0"=展开;缺省(首装/无值)= 展开(默认不变)。
const RAIL_COLLAPSED_KEY = "creatoros:draft:rail-collapsed";
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
  // [T-150] 折叠态。SSR/首帧默认 false(展开)避免 hydration 闪,挂载后读回持久值。
  const [collapsed, setCollapsed] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const [narrow, setNarrow] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const panelRef = React.useRef<HTMLElement>(null);
  const mobileTriggerRef = React.useRef<HTMLButtonElement>(null);
  const expandRef = React.useRef<HTMLButtonElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const lastFocusedRef = React.useRef<HTMLElement | null>(null);
  const focusFrame = React.useRef<number | null>(null);
  const previousNarrow = React.useRef(false);
  const panelHidden = narrow ? !mobileOpen : collapsed;

  const focusAfterRender = React.useCallback((target: () => HTMLElement | null) => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      const node = target();
      if (node?.isConnected && !node.closest('[hidden],[inert],[aria-hidden="true"]')) node.focus();
    });
  }, []);
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 1279px)");
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  React.useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
  }, []);
  React.useEffect(() => {
    const wasNarrow = previousNarrow.current;
    previousNarrow.current = narrow;
    const active = document.activeElement;
    const owner = active?.closest('dialog,[role="dialog"],[role="alertdialog"]');
    // 断点变化也不能抢走仍由嵌套来源/确认弹窗持有的合法焦点。
    if (owner && owner !== panelRef.current && !owner.closest('[hidden],[inert],[aria-hidden="true"]')) return;
    const last = lastFocusedRef.current;
    const blurred = active === document.body || !active?.isConnected;
    const fromPanel = panelRef.current?.contains(active) || (blurred && last && panelRef.current?.contains(last));
    const fromMobileTrigger = last?.dataset.slot === "draft-rail-mobile-trigger" && (blurred || active === last);
    const fromDesktopExpand = last?.dataset.slot === "draft-rail-expand-toggle" && (blurred || active === last);
    if (narrow && mobileOpen) {
      focusAfterRender(() => closeRef.current);
    } else if (!wasNarrow && narrow && (fromPanel || fromDesktopExpand)) {
      focusAfterRender(() => mobileTriggerRef.current);
    } else if (wasNarrow && !narrow && ((collapsed && fromPanel) || fromMobileTrigger)) {
      focusAfterRender(() => collapsed ? expandRef.current : closeRef.current);
    }
  }, [narrow, mobileOpen, collapsed, focusAfterRender]);
  const closeMobile = React.useCallback(() => {
    setMobileOpen(false);
    focusAfterRender(() => mobileTriggerRef.current);
  }, [focusAfterRender]);
  const mobileKeys = React.useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const panel = panelRef.current;
    const target = event.target;
    if (!narrow || !mobileOpen || event.defaultPrevented || !panel?.isConnected) return;
    // Portal 沿 React 树冒泡，但键盘只属于实际物理 DOM 的最近 dialog owner。
    if (!(target instanceof Element) || !panel.contains(target) || target.closest('dialog,[role="dialog"],[role="alertdialog"]') !== panel) return;
    if (event.key === "Escape") { event.preventDefault(); closeMobile(); return; }
    if (event.key !== "Tab") return;
    const nodes = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(node => node.offsetParent !== null);
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }, [narrow, mobileOpen, closeMobile]);

  // 挂载后读回持久宽度(SSR 默认 380,避免 hydration mismatch)。
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(RAIL_WIDTH_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时从 localStorage 同步宽度偏好，SSR 首帧保持默认值
      if (v) setRailWidth(clampRail(parseInt(v, 10)));
    } catch {
      /* storage 不可用 → 用默认宽 */
    }
  }, []);

  // [T-150] 挂载后读回持久折叠态(仅 "1" → 收起;缺省/其它 → 保持展开默认)。这是「从外部
  // 系统(localStorage)同步到 React」的合法一次性挂载读取(与上方 T-130 宽度读回同范式);
  // set-state-in-effect 规则的启发式会误报,故就地豁免(SSR 首帧展开避免 hydration 闪)。
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(RAIL_COLLAPSED_KEY) === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时从 localStorage 同步折叠偏好
        setCollapsed(true);
      }
    } catch {
      /* storage 不可用 → 展开(默认) */
    }
  }, []);

  const persist = React.useCallback((w: number) => {
    try {
      window.localStorage.setItem(RAIL_WIDTH_KEY, String(w));
    } catch {
      /* 写失败(隐私模式)→ 本次会话生效不持久 */
    }
  }, []);

  // [T-150] 折叠态持久化(与宽度共享 try/catch 降级范式)。
  const persistCollapsed = React.useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(RAIL_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* 写失败 → 本次会话生效不持久 */
    }
  }, []);

  const setCollapsedPersisted = React.useCallback(
    (next: boolean) => {
      setCollapsed(next);
      persistCollapsed(next);
    },
    [persistCollapsed],
  );

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

  // [T-150] 关键边界:收起态来了**新** request(nonce 变)→ 自动展开右栏,否则用户收起后点
  // 「审核/搜素材/盲预测」结果喂进隐藏 rail 就丢了。用 ref 记上一个 nonce,只在真的
  // 变化时展开(首挂载 request=null / nonce 概念上为 0,不误触发把手动收起顶开)。
  const { request } = useDraftChatRequest();
  const nonce = request?.nonce ?? null;
  const lastNonceRef = React.useRef<number | null>(nonce);
  React.useEffect(() => {
    const prev = lastNonceRef.current;
    lastNonceRef.current = nonce;
    // 只有 nonce 真的变到一个新的非空值(用户点了 AI 按钮)才自动展开;首挂载 prev===nonce
    // (含二者皆 null)不触发。展开是「自动」的,不写持久(用户没手动改偏好)。这是「订阅外部
    // 请求(nonce 变化)→ 回调里 setState」的合法模式(条件守卫,非无条件同步 setState)。
    if (nonce !== null && nonce !== prev) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 条件消费外部请求的新 nonce；同 nonce 的重开和断点切换不触发
      if (narrow) setMobileOpen(true);
      else setCollapsed(false);
    }
  }, [nonce, narrow]);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1" onFocusCapture={event => {
      if (event.target instanceof HTMLElement && event.currentTarget.contains(event.target)) lastFocusedRef.current = event.target;
    }}>
      <div
        data-slot="draft-pane"
        inert={narrow && mobileOpen}
        aria-hidden={narrow && mobileOpen || undefined}
        className="relative flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4"
      >
        {left}
      </div>

      {/* [T-130] 拖拽分隔条(仅 xl+ 右栏可见时 xl:block)—— pointer 拖 + 键盘 ←/→ 微调,
          role=separator + aria-valuenow/min/max 供辅助技术。[T-150] 收起态整条隐藏(连同右栏)。 */}
      {!collapsed && !narrow ? (
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
      ) : null}

      {/* 同一个 right 常驻：收起只 hidden/inert，不重建 nonce 消费与未发输入。
          隐藏时保留原在途任务单 feed，终态沿原逻辑停止；不新增轮询。 */}
        <aside
          ref={panelRef}
          data-slot="draft-chat-rail"
          role={narrow && mobileOpen ? "dialog" : undefined}
          aria-modal={narrow && mobileOpen ? true : undefined}
          aria-label="编导对话"
          hidden={panelHidden}
          inert={panelHidden}
          aria-hidden={panelHidden || undefined}
          onKeyDown={mobileKeys}
          style={{ width: narrow ? "min(100vw, 640px)" : railWidth }}
          className={cn("shrink-0 flex-col border-l border-border bg-surface", panelHidden ? "hidden" : narrow ? "fixed inset-y-0 right-0 z-50 flex shadow-lg" : "hidden xl:flex")}
        >
          {/* [T-150] 右栏头部：同一收起控件服务宽栏与窄窗本地面板。 */}
          <div
            data-slot="draft-rail-header"
            className="flex shrink-0 items-center justify-end border-b border-border px-3 py-1.5"
          >
            <button
              type="button"
              ref={closeRef}
              data-slot="draft-rail-collapse-toggle"
              data-testid="draft-rail-collapse-toggle"
              aria-label="收起编导栏"
              onClick={() => {
                if (narrow) closeMobile();
                else { setCollapsedPersisted(true); focusAfterRender(() => expandRef.current); }
              }}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-text-subtle transition-colors",
                "hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              )}
            >
              <span aria-hidden="true">⟩</span>
              收起编导
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{right}</div>
        </aside>
      {!narrow && collapsed ? (
        /* [T-150] 收起态的展开 affordance —— 最右一条细竖条,竖排「⟨ 编导」,点击展开右栏。
           仅 xl+ 出现(右栏本就 hidden xl:flex);窄屏本无右栏,不需要此入口。 */
        <button
          type="button"
          ref={expandRef}
          data-slot="draft-rail-expand-toggle"
          data-testid="draft-rail-expand-toggle"
          aria-label="展开编导栏"
          title="展开编导栏"
          onClick={() => { setCollapsedPersisted(false); focusAfterRender(() => closeRef.current); }}
          className={cn(
            "hidden w-7 shrink-0 cursor-pointer flex-col items-center gap-1 border-l border-border bg-surface py-3 text-xs text-text-subtle transition-colors xl:flex",
            "hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40",
          )}
        >
          <span aria-hidden="true">⟨</span>
          <span className="[writing-mode:vertical-rl]">编导</span>
        </button>
      ) : null}
      {narrow && !mobileOpen ? <Button ref={mobileTriggerRef} data-slot="draft-rail-mobile-trigger" variant="outline" className="fixed bottom-5 right-5 z-40" onClick={() => setMobileOpen(true)}>打开编导</Button> : null}
    </div>
  );
}
