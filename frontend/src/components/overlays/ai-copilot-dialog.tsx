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
 */

import * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AICopilotContent } from "@/features/copilot/ai-copilot-content";

export interface AICopilotDialogProps {
  readonly pathname: string;
}

export function AICopilotDialog({ pathname }: AICopilotDialogProps) {
  return (
    <div className="flex flex-col gap-4" data-slot="ai-copilot-dialog">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-wide text-text-subtle">
            AI 助手
          </span>
          <h2
            id="ai-copilot-title"
            className="font-heading text-[17px] font-semibold leading-tight text-foreground"
          >
            你的个人创作 Copilot
          </h2>
          <p className="text-xs text-muted-foreground">
            当前页面：
            <span className="font-medium text-foreground">{pathname}</span>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="关闭 AI 助手"
          data-overlay-close
          data-slot="ai-copilot-close"
          className="shrink-0"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <AICopilotContent />
    </div>
  );
}

export default AICopilotDialog;
