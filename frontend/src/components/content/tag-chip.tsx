/**
 * `TagChip` is the canonical non-interactive tag pill used by Knowledge,
 * Experience, Script golden quotes, and Tags.
 *
 * Server component: no interactivity required.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

export interface TagChipProps {
  readonly label: string;
  readonly tone?: "neutral" | "brand" | "success" | "warning" | "info";
  readonly size?: "sm" | "md";
  readonly removable?: boolean;
  readonly onRemove?: () => void;
  readonly className?: string;
}

const TONE_CLASS: Record<NonNullable<TagChipProps["tone"]>, string> = {
  neutral: "bg-surface-subtle text-muted-foreground",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

const SIZE_CLASS: Record<NonNullable<TagChipProps["size"]>, string> = {
  sm: "h-5 px-2 text-xs",
  md: "h-6 px-2.5 text-xs",
};

export function TagChip({
  label,
  tone = "neutral",
  size = "md",
  removable = false,
  onRemove,
  className,
}: TagChipProps) {
  return (
    <span
      data-slot="tag-chip"
      data-tone={tone}
      data-size={size}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-medium",
        TONE_CLASS[tone],
        SIZE_CLASS[size],
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {removable ? (
        <button
          type="button"
          aria-label={`移除标签 ${label}`}
          onClick={onRemove}
          className="inline-flex size-4 items-center justify-center rounded-full text-current hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </span>
  );
}
