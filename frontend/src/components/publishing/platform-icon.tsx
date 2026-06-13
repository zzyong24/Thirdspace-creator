/**
 * `PlatformIcon` renders the deterministic, token-based icon for a
 * publishing platform. It is the only place that imports
 * `getPlatformIcon` from `@/lib/platform-icons`.
 *
 * Server component: no interactivity required.
 *
 * Used by Projects, Publishing Center, Search, Publishing Workspace.
 */

import * as React from "react";

import { getPlatformIcon } from "@/lib/platform-icons";
import { cn } from "@/lib/utils";

import type { PlatformId } from "@/types/domain";

export interface PlatformIconProps {
  readonly platform: PlatformId | string;
  readonly size?: "xs" | "sm" | "md" | "lg";
  readonly showLabel?: boolean;
  readonly className?: string;
}

const SIZE_DIMENSIONS: Record<NonNullable<PlatformIconProps["size"]>, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
};

const SIZE_TEXT: Record<NonNullable<PlatformIconProps["size"]>, string> = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-md",
};

export function PlatformIconView({
  platform,
  size = "sm",
  showLabel = false,
  className,
}: PlatformIconProps) {
  const icon = getPlatformIcon(platform);
  const dimension = SIZE_DIMENSIONS[size];
  const fontSize = SIZE_TEXT[size];
  return (
    <span
      data-slot="platform-icon"
      data-platform={icon.id}
      aria-label={icon.label}
      role="img"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md font-semibold leading-none",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-md",
          fontSize,
        )}
        style={{
          width: `${dimension}px`,
          height: `${dimension}px`,
          backgroundColor: icon.background,
          color: icon.foreground,
        }}
      >
        {icon.glyph}
      </span>
      {showLabel ? <span className="text-sm text-foreground">{icon.label}</span> : null}
    </span>
  );
}
