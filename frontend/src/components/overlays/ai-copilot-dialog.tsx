/**
 * `AICopilotDialog` is the centered dialog shell opened by the
 * `?copilot=open` query parameter (Task 24 / page-specs §16).
 *
 * The dialog is mounted inside the single shared `OverlayController`
 * (see `frontend/src/app/(creator)/shell-router.tsx`). The Controller
 * owns:
 *  - the `?copilot=open` URL watch,
 *  - the focus trap,
 *  - the Escape-to-close behavior,
 *  - the body scroll lock,
 *  - the trigger-focus restoration on close.
 *
 * This shell contributes:
 *  - the visual header (title + close button marked with
 *    `data-overlay-close` so the Controller's delegated click handler
 *    closes the dialog),
 *  - the centered layout (per D-006 / page-specs §16 the dialog is
 *    centered, not a right-side drawer),
 *  - the mount for the page-specs §16 component tree (`AICopilotContent`).
 *
 * The `pathname` is forwarded so the content can show the current
 * page context inside the dashboard. The dialog never makes a real
 * network request — submit is fixture-only local action.
 *
 * The keyboard-shortcut hint ("按 Esc 关闭 · ↑↓ 切换 · Enter 执行")
 * is rendered by `AICopilotShortcutHint` and dispatched by
 * `CopilotOverlayBridge` so the hint can sit on the dimmer layer
 * BELOW the dialog panel (it is part of the visual reference and
 * must not be clipped by the panel's overflow-y-auto).
 */

import * as React from "react";
import { Sparkles, X } from "lucide-react";

import { AICopilotContent } from "@/features/copilot/ai-copilot-content";

export interface AICopilotDialogProps {
  readonly pathname: string;
}

export function AICopilotDialog({ pathname }: AICopilotDialogProps) {
  return (
    // bug #5:对话框做满高 flex 列(min-h-0 允许内部收缩),AICopilotContent 以 flex-1 占满,
    // 让对话区成为可滚主区、次区折叠在下。
    <div
      className="flex h-full min-h-0 flex-col gap-3"
      data-slot="ai-copilot-dialog"
      data-current-path={pathname}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand" aria-hidden="true" />
          <h2
            id="ai-copilot-title"
            className="font-heading text-lg font-semibold leading-tight text-foreground"
          >
            AI 助手
          </h2>
          {/* [T-096 #3] 「⌘K 全局唤醒」假徽标已摘:⌘K 实际绑定 /search(T-051 裁决),
              浮层从无该监听 —— 死入口不再假承诺(T-048 审计实锤)。 */}
        </div>
        <div className="flex items-center gap-3">
          {/* 「历史记录」按钮已下沉到 AICopilotContent 的头部并做实(它持有 conversationId +
              setMessages,历史读回逻辑与之同处一地);这里只留关闭按钮。 */}
          <button
            type="button"
            aria-label="关闭 AI 助手"
            data-overlay-close
            data-slot="ai-copilot-close"
            data-testid="ai-copilot-close"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-0 focus-visible:ring-0"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <AICopilotContent />
      </div>
    </div>
  );
}

export default AICopilotDialog;
