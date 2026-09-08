"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  ChevronDownIcon,
  ChevronRightIcon
} from "lucide-react";

export function CollapsibleModelGroup({
  title,
  highlight,
  highlightKeys,
  children,
}: {
  title: string;
  /** 当前 ?highlight 值(SettingsDialog 透传);命中 highlightKeys 时初始展开。 */
  highlight: string | null;
  /** 组内各卡的 highlight stepKey;highlight 命中其一 → 初始展开。 */
  highlightKeys: readonly string[];
  children: React.ReactNode;
}) {
  const shouldOpenForHighlight =
    highlight != null && highlightKeys.includes(highlight);
  const [collapsed, setCollapsed] = React.useState(!shouldOpenForHighlight);
  const count = React.Children.count(children);

  return (
    <div data-slot="models-more-group" className="flex flex-col gap-2">
      <button
        type="button"
        data-slot="models-more-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 text-left",
          "rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {collapsed ? (
          <ChevronRightIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        ) : (
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        )}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span
          data-slot="models-more-count"
          className="text-xs text-muted-foreground"
        >
          {count} 项
        </span>
      </button>
      {/* body 始终挂载,折叠时仅 hidden(保深链/测可达);展开时纵向排列各卡。 */}
      <div
        data-slot="models-more-body"
        hidden={collapsed}
        className="flex flex-col gap-card-gap"
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultimodalModelCard — 文生图 / 文生视频 (SPEC 2026-07-01 §2.1 / M3)
// ---------------------------------------------------------------------------
//
// Two extra capabilities — `image.generate` (文生图) and `video.generate`
// (文生视频) — bound with the SAME cc-switch form + `settings.models.put` op as
// the text ModelConfigurationCard above. `capability` is a free-form contract
// string, so these reuse `putModel`/`listModels` with ZERO contract change.
//
// Difference vs the text card: NO apiFormat / temperature. `resolveMultimodalSpec`
// (server/ai/multimodal/resolve.ts) dispatches purely on `provider` and reads only
// provider / baseUrl / model / secret — so the form surfaces exactly those four
// fields (no dead controls). The API key is stored in the LOCAL db and masked to
// `hasSecret` on read (raw key never echoed back). minimax is the only provider
// with a shipped adapter today (M1), but the provider input is free-form and
// extensible — it is NOT locked to minimax.
//
// Honesty (铁律): an unconfigured capability leaves provider/model/key blank and
// hasSecret=false. The card says so ("未配置 → 录制页 AI 生成禁用"); it never
// pretends generation works before a key is bound.

