/**
 * Structural prop types for the shared resource/asset components
 * (SPEC §7, 内容与资源). They mirror the asset view-model shape but are
 * declared here so the components stay decoupled from any single feature —
 * any object with this shape (e.g. the assets page `AssetSummary`)
 * satisfies them by structural typing.
 */

import type { AssetType } from "@/types/domain";

export interface ResourceAsset {
  readonly id: string;
  readonly name: string;
  readonly type: AssetType;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly tags: ReadonlyArray<string>;
  readonly thumbnailToken: string;
  readonly updatedAt: string;
}

export interface ResourceAssetUsage {
  readonly id: string;
  readonly assetId: string;
  readonly projectTitle: string;
  readonly dateLabel: string;
}
