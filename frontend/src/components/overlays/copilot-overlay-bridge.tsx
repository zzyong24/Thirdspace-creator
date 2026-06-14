"use client";

/**
 * `CopilotOverlayBridge` is the copilot-specific companion that
 * renders the keyboard-shortcut hint BELOW the dialog panel.
 *
 * The reference image (`ui/AIchat.png`) places the hint
 * "按 Esc 关闭 · ↑↓ 切换 · Enter 执行" ~24px below the dialog
 * panel, on the dimmer. The shared `OverlayController` wraps its
 * `children` in the `overlay-panel` div which scrolls internally.
 *
 * This component uses `position: fixed` so it is positioned
 * relative to the viewport — not clipped by the panel's
 * `overflow-y-auto`. `pointer-events: none` keeps focus trap and
 * click delegation in the panel from being disrupted.
 */

import * as React from "react";

export function CopilotOverlayBridge(): React.ReactElement | null {
  return (
    <p
      data-slot="ai-copilot-shortcut-hint"
      className="pointer-events-none fixed left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground"
      style={{ top: "calc(50% + 380px)" }}
    >
      按 Esc 关闭 · ↑↓ 切换 · Enter 执行
    </p>
  );
}

export default CopilotOverlayBridge;
