/**
 * `MediaPreview` (SPEC §7, 内容与资源; page-specs §12) renders a small,
 * deterministic thumbnail composition that varies by `asset.type`
 * (video / image / audio / document / subtitle). The `data-asset-type` and
 * `data-asset-thumbnail-token` slots give tests a deterministic handle.
 *
 * Server component: no interactivity.
 */

import * as React from "react";

import { formatDuration } from "@/components/resources/asset-format";
import type { AssetType } from "@/types/domain";
import type { ResourceAsset } from "@/components/resources/types";

export function MediaPreview({ asset }: { asset: ResourceAsset }) {
  const token = asset.thumbnailToken;
  return (
    <div
      data-slot="media-preview"
      data-asset-type={asset.type}
      data-asset-thumbnail-token={token}
      aria-hidden="true"
      className={
        "relative aspect-[3/2] w-full overflow-hidden rounded-control border " +
        previewContainerClass(asset.type)
      }
    >
      <PreviewGlyph type={asset.type} token={token} name={asset.name} />
      {asset.durationMs !== null ? (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-foreground/70 px-1.5 font-mono text-[10px] tabular-nums text-background">
          {formatDuration(asset.durationMs)}
        </span>
      ) : asset.width !== null && asset.height !== null ? (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-foreground/70 px-1.5 font-mono text-[10px] tabular-nums text-background">
          {asset.width}×{asset.height}
        </span>
      ) : null}
      {asset.type === "video" ? (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-foreground/80 text-background shadow-sm"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
            <path d="M5 3.5 L13 8 L5 12.5 Z" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}

function previewContainerClass(type: AssetType): string {
  switch (type) {
    case "video":
      return "border-border bg-gradient-to-br from-info/20 via-info/10 to-surface-subtle text-info";
    case "image":
      return "border-border bg-gradient-to-br from-brand/20 via-brand/10 to-surface-subtle text-brand";
    case "audio":
      return "border-border bg-gradient-to-br from-warning/20 via-warning/10 to-surface-subtle text-warning";
    case "document":
      return "border-border bg-gradient-to-br from-muted via-surface-subtle to-surface text-muted-foreground";
    case "subtitle":
      return "border-border bg-gradient-to-br from-success/20 via-success/10 to-surface-subtle text-success";
  }
}

function PreviewGlyph({
  type,
  token,
  name,
}: {
  type: AssetType;
  token: string;
  name: string;
}) {
  const digits = token
    .replace(/[^0-9a-f]/g, "")
    .slice(0, 4)
    .padEnd(4, "0");
  const parseHexPair = (value: string) => Number.parseInt(value || "0", 16);
  // Each thumbnail is a full-bleed composition that varies by type. No
  // fixed pixel size — the SVG fills the parent (aspect-video) so the
  // reference image proportions match the page (1.6:1 wide cards).
  if (type === "image") {
    return (
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full text-current"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.18} />
        <circle cx={parseHexPair(digits.slice(0, 2)) % 140 + 10} cy={parseHexPair(digits.slice(2, 4)) % 70 + 10} r={10} fill="currentColor" />
        <path
          d="M0 78 L40 60 L70 70 L100 50 L130 65 L160 55 L160 90 L0 90 Z"
          fill="currentColor"
          opacity={0.55}
        />
        <path
          d="M0 90 L30 82 L60 86 L90 78 L120 84 L160 80 L160 90 Z"
          fill="currentColor"
          opacity={0.8}
        />
      </svg>
    );
  }
  if (type === "video") {
    return (
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full text-current"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.22} />
        <rect x={6} y={10} width={148} height={70} rx={3} fill="currentColor" opacity={0.1} />
        <rect x={6} y={10} width={148} height={70} rx={3} stroke="currentColor" strokeWidth={1} fill="none" opacity={0.4} />
        <text
          x={80}
          y={50}
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={11}
          fontWeight={600}
          fill="currentColor"
          opacity={0.9}
        >
          {name.length > 16 ? `${name.slice(0, 15)}…` : name}
        </text>
        <rect x={6} y={82} width={(parseHexPair(digits.slice(0, 2)) % 100) + 30} height={2} fill="currentColor" opacity={0.7} />
      </svg>
    );
  }
  if (type === "audio") {
    const barHeights = Array.from({ length: 26 }, (_, i) =>
      8 + (parseHexPair(digits.charAt(i % digits.length)) % 56),
    );
    return (
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full text-current"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.2} />
        {barHeights.map((h, i) => {
          const x = 8 + i * 5.6;
          const y = 45 - h / 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={3.6}
              height={h}
              rx={1.2}
              fill="currentColor"
              opacity={0.7 + (i % 3) * 0.1}
            />
          );
        })}
      </svg>
    );
  }
  if (type === "document") {
    return (
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full text-current"
        aria-hidden="true"
      >
        <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.08} />
        <rect x={40} y={6} width={80} height={78} rx={4} fill="currentColor" opacity={0.22} />
        <rect x={50} y={20} width={60} height={4} fill="currentColor" opacity={0.7} />
        <rect x={50} y={32} width={parseHexPair(digits.slice(0, 2)) % 40 + 20} height={4} fill="currentColor" opacity={0.7} />
        <rect x={50} y={44} width={parseHexPair(digits.slice(2, 4)) % 44 + 16} height={4} fill="currentColor" opacity={0.7} />
        <rect x={50} y={56} width={parseHexPair(digits.slice(0, 2)) % 36 + 24} height={4} fill="currentColor" opacity={0.7} />
        <rect x={50} y={68} width={parseHexPair(digits.slice(2, 4)) % 30 + 12} height={4} fill="currentColor" opacity={0.7} />
      </svg>
    );
  }
  // subtitle
  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      className="size-full text-current"
      aria-hidden="true"
    >
      <rect x={0} y={0} width={160} height={90} fill="currentColor" opacity={0.16} />
      <rect x={12} y={28} width={136} height={36} rx={3} fill="currentColor" opacity={0.2} />
      <rect x={28} y={36} width={parseHexPair(digits.slice(0, 2)) % 60 + 30} height={4} fill="currentColor" />
      <rect x={28} y={48} width={parseHexPair(digits.slice(2, 4)) % 60 + 30} height={4} fill="currentColor" />
    </svg>
  );
}
