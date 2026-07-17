/**
 * Assets Center selector.
 *
 * Maps the canonical dataset to the `AssetsViewModel` consumed by the
 * Assets Center page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. Page components import
 * `buildAssetsViewModel` from `@/fixtures/selectors` and never
 * dereference `canonicalDataset` for data shaping.
 */

import { canonicalDataset } from "../canonical";
import type { AssetType } from "@/types/domain";
import type {
  AssetSummary,
  AssetTypeCount,
  AssetUsageRow,
  AssetsViewModel,
} from "@/features/assets/assets-page";

// ---------------------------------------------------------------------------
// Deterministic thumbnail tokens per asset type
// ---------------------------------------------------------------------------

const TYPE_TONE: Record<AssetType, AssetTypeCount["tone"]> = {
  image: "brand",
  video: "info",
  audio: "warning",
  document: "neutral",
  subtitle: "success",
};

const TYPE_LABEL: Record<AssetType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
  subtitle: "字幕",
};

function hashToken(input: string): string {
  // Simple FNV-1a 32-bit hash. Pure function — no `Math.random`, no
  // `Date.now`. The page is fully deterministic.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash =
      (hash +
        ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>>
      0;
  }
  return hash.toString(16).padStart(8, "0");
}

function thumbnailTokenFor(assetType: AssetType, assetId: string): string {
  return `${assetType}-${hashToken(`${assetType}:${assetId}`)}`;
}

// ---------------------------------------------------------------------------
// Real-op mapping (module 07 E1): map `assets.list` rows → AssetSummary[]
// ---------------------------------------------------------------------------

// Minimal shape of the `assetResource` rows the `assets.list` op returns. The
// list op does not join `asset_files`, so file-derived fields (mimeType /
// fileSize / dimensions / duration) are resolved from the canonical files when a
// matching `currentFileId` is seeded, else fall back to deterministic defaults.
// Tags come from canonical entity_tags (Taxonomy-owned; decorative this wave).
export interface AssetListRow {
  readonly id: string;
  readonly currentFileId: string;
  readonly assetType: AssetType;
  readonly name: string;
  readonly description: string;
  readonly updatedAt: string;
  // [T-381] 入库时间(assetResource.createdAt;素材中心统一「按新旧」排序键)。
  readonly createdAt?: string;
  // [T-051 2e] 收藏 flag(契约 assetResource.isFavorite)。
  readonly isFavorite?: boolean;
  // [T-061] file 派生字段(op 现随行带真值;此前只能 canonical 兜底 → 真上传素材
  // 显示 octet-stream/0B)。
  readonly mimeType?: string | null;
  readonly fileSize?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly durationMs?: number | null;
  // [T-146 切片 a] 文档抽取投影(assetResource 现随行带;仅 document 有值)。
  readonly extractStatus?: string | null;
  readonly materialSummary?: {
    readonly keyPoints?: ReadonlyArray<string>;
    readonly facts?: ReadonlyArray<string>;
    readonly sellingPoints?: ReadonlyArray<string>;
  } | null;
  readonly extractedText?: string | null;
}

export function buildAssetSummariesFromResources(
  rows: ReadonlyArray<AssetListRow>,
): ReadonlyArray<AssetSummary> {
  const filesById = new Map(
    canonicalDataset.assetFiles.map((file) => [file.id, file] as const),
  );
  return rows.map<AssetSummary>((asset) => {
    const file = filesById.get(asset.currentFileId);
    const tagsForAsset = canonicalDataset.entityTags
      .filter((row) => row.entityType === "asset" && row.entityId === asset.id)
      .map((row) => canonicalDataset.tags.find((tag) => tag.id === row.tagId)?.name)
      .filter((name): name is string => Boolean(name));
    return {
      id: asset.id,
      name: asset.name,
      description: asset.description,
      type: asset.assetType,
      // [T-061] op 真值优先;canonical 仅兜 seed 行(其 currentFileId 在 fixture 里)。
      mimeType: asset.mimeType ?? file?.mimeType ?? "application/octet-stream",
      fileSizeBytes: asset.fileSize ?? file?.fileSize ?? 0,
      width: asset.width ?? file?.width ?? null,
      height: asset.height ?? file?.height ?? null,
      durationMs: asset.durationMs ?? file?.durationMs ?? null,
      tags: tagsForAsset,
      thumbnailToken: thumbnailTokenFor(asset.assetType, asset.id),
      updatedAt: asset.updatedAt,
      // [T-381] 入库时间透传(统一「按新旧」排序键;op 行必带,缺省回退 updatedAt)。
      createdAt: asset.createdAt ?? asset.updatedAt,
      // [T-051 2e] 收藏读回:此前 toggle 落库但投影不带,全 UI 无痕迹。
      isFavorite: asset.isFavorite ?? false,
      // [T-146 切片 a] 文档抽取投影透传(op 真值;非文档/未抽 → 缺省)。
      extractStatus: asset.extractStatus ?? null,
      materialSummary: asset.materialSummary ?? null,
      extractedText: asset.extractedText ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// View-model builder
// ---------------------------------------------------------------------------

export function buildAssetsViewModel(): AssetsViewModel {
  const assetsCanonical = canonicalDataset.assets;
  const filesById = new Map(
    canonicalDataset.assetFiles.map((file) => [file.id, file] as const),
  );
  const summaries: ReadonlyArray<AssetSummary> = assetsCanonical
    .filter((asset) => asset.status === "active" && asset.deletedAt === null)
    .map<AssetSummary>((asset) => {
      const file = filesById.get(asset.currentFileId);
      const mimeType = file?.mimeType ?? "application/octet-stream";
      const tagsForAsset = canonicalDataset.entityTags
        .filter(
          (row) => row.entityType === "asset" && row.entityId === asset.id,
        )
        .map((row) =>
          canonicalDataset.tags.find((tag) => tag.id === row.tagId)?.name,
        )
        .filter((name): name is string => Boolean(name));
      return {
        id: asset.id,
        name: asset.name,
        description: asset.description,
        type: asset.assetType,
        mimeType,
        fileSizeBytes: file?.fileSize ?? 0,
        width: file?.width ?? null,
        height: file?.height ?? null,
        durationMs: file?.durationMs ?? null,
        tags: tagsForAsset,
        thumbnailToken: thumbnailTokenFor(asset.assetType, asset.id),
        updatedAt: asset.updatedAt,
        // [T-381] 入库时间(统一「按新旧」排序键)。
        createdAt: asset.createdAt,
      };
    });

  const counts: ReadonlyArray<AssetTypeCount> = (
    ["image", "video", "audio", "document", "subtitle"] as ReadonlyArray<AssetType>
  ).map<AssetTypeCount>((type) => ({
    type,
    label: TYPE_LABEL[type],
    count: summaries.filter((asset) => asset.type === type).length,
    tone: TYPE_TONE[type],
  }));

  // Derive asset usage history by walking segmentAssets →
  // productionSegments → productions → contentOutputs → projects.
  const segmentsById = new Map(
    canonicalDataset.productionSegments.map((seg) => [seg.id, seg] as const),
  );
  const productionsById = new Map(
    canonicalDataset.productions.map((prod) => [prod.id, prod] as const),
  );
  const outputsById = new Map(
    canonicalDataset.contentOutputs.map((out) => [out.id, out] as const),
  );
  const usageLabel: Record<string, string> = {
    video: "主画面",
    broll: "B-Roll",
    overlay: "叠加图层",
    audio: "背景音",
    caption: "字幕",
  };
  const usage: ReadonlyArray<AssetUsageRow> = canonicalDataset.segmentAssets
    .map<AssetUsageRow | null>((row) => {
      const segment = segmentsById.get(row.productionSegmentId);
      if (!segment) return null;
      const production = productionsById.get(segment.productionId);
      if (!production) return null;
      const output = outputsById.get(production.contentOutputId);
      if (!output) return null;
      const project = canonicalDataset.projects.find(
        (p) => p.id === output.projectId,
      );
      return {
        id: row.id,
        assetId: row.assetId,
        projectId: output.projectId,
        projectTitle: project?.title ?? "未关联项目",
        note: usageLabel[row.usageType] ?? row.usageType,
        dateLabel: production.updatedAt.slice(0, 10),
      };
    })
    .filter((row): row is AssetUsageRow => row !== null)
    .slice(0, 5);

  const totalBytes = summaries.reduce(
    (acc, asset) => acc + asset.fileSizeBytes,
    0,
  );
  const STORAGE_CAP_BYTES = 50 * 1024 * 1024 * 1024;
  const usedLabel = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  const totalLabel = "50 GB";

  return {
    assets: summaries,
    typeCounts: counts,
    usageHistory: usage,
    storage: {
      usedBytes: totalBytes,
      totalBytes: STORAGE_CAP_BYTES,
      usedLabel,
      totalLabel,
    },
  };
}
