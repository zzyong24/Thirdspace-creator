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
  // [T-051 2e] 收藏痕迹:assets.favorite.toggle 落库的 isFavorite 读回,卡片显 ★。
  readonly isFavorite?: boolean;
  // [T-146 切片 a] 文档抽取(仅 document):extractStatus ∈ done|failed|unsupported|pending|null;
  // materialSummary = 「资料要点卡」({ keyPoints, facts, sellingPoints? });extractedText = 全文
  // (详情面板「查看全文」)。非文档/未抽 → 均缺省(详情面板据此显要点卡 / 诚实失败提示)。
  readonly extractStatus?: string | null;
  readonly materialSummary?: {
    readonly keyPoints?: ReadonlyArray<string>;
    readonly facts?: ReadonlyArray<string>;
    readonly sellingPoints?: ReadonlyArray<string>;
  } | null;
  readonly extractedText?: string | null;
  readonly sourceUrl?: string | null;
}

export interface ResourceAssetUsage {
  readonly id: string;
  readonly assetId: string;
  readonly projectTitle: string;
  readonly dateLabel: string;
}
