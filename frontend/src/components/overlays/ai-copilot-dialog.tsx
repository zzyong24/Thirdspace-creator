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
import { Clock3, Sparkles, X } from "lucide-react";

import { AICopilotContent } from "@/features/copilot/ai-copilot-content";

export interface AICopilotDialogProps {
  readonly pathname: string;
}

export function AICopilotDialog({ pathname }: AICopilotDialogProps) {
  return (
    <div
      className="flex flex-col gap-3"
      data-slot="ai-copilot-dialog"
      data-current-path={pathname}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand" aria-hidden="true" />
          <h2
            id="ai-copilot-title"
            className="font-heading text-lg font-semibold leading-tight text-foreground"
          >
            Creator Copilot
          </h2>
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
            ⌘ K　全局唤醒
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-slot="ai-copilot-history"
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-0 focus-visible:ring-0"
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            历史记录
          </button>
          <span className="h-5 w-px bg-border" aria-hidden="true" />
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

      <AICopilotContent />
    </div>
  );
}

export default AICopilotDialog;
