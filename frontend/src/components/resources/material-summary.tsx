"use client";

/**
 * 资料要点共用件(T-146)。
 *
 * 素材中心详情面板(asset-detail-panel)与稿面内容弹药双击预览都复用这套组件,
 * 一处改动两处生效,不再各写各的折叠/全文逻辑:
 *
 *   - `MaterialSummaryList`  折叠优先的要点清单(keyPoints / facts / sellingPoints):
 *       每组只显前 N 条(默认 3),超出显「展开 X 条」;点开就地展开,不弹层。
 *   - `MaterialSummaryModal` 「查看全文」用 `ui/dialog` Modal(替原生 <details>):
 *       完整资料要点 + 抽取全文,长文在 Modal 内滚动。图片素材(带 previewUrl)在
 *       Modal 顶部渲真图(块1 同款签名 URL),加载失败(onError)静默隐藏,不摆碎图。
 *
 * 只呈现原文已有(要点卡是 AI 从第一手资料提炼,不编造);全文缺失时 Modal 只显要点。
 */

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssetLivePreview } from "@/components/resources/asset-live-preview";
import type { ResourceAsset } from "@/components/resources/types";
import type { AssetType } from "@/types/domain";

const PREVIEW_TYPE_LABEL: Record<AssetType, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  document: "文档",
  subtitle: "字幕",
};

function asAssetType(value: string | null | undefined): AssetType | null {
  return value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "document" ||
    value === "subtitle"
    ? value
    : null;
}

// 结构化要点(与 ResourceAsset.materialSummary / ammo 投影同形,结构类型即可复用)。
export interface MaterialSummaryData {
  readonly keyPoints?: ReadonlyArray<string>;
  readonly facts?: ReadonlyArray<string>;
  readonly sellingPoints?: ReadonlyArray<string>;
}

export function materialSummaryHasCard(
  summary: MaterialSummaryData | null | undefined,
): boolean {
  if (!summary) return false;
  return (
    (summary.keyPoints?.length ?? 0) > 0 ||
    (summary.facts?.length ?? 0) > 0 ||
    (summary.sellingPoints?.length ?? 0) > 0
  );
}

// ---------------------------------------------------------------------------
// 折叠优先的单组要点清单(限前 N 条 + 就地展开)。
// ---------------------------------------------------------------------------
function CollapsibleGroup({
  label,
  items,
  limit = 3,
}: {
  readonly label: string;
  readonly items: ReadonlyArray<string>;
  readonly limit?: number;
}) {
  const [expanded, setExpanded] = React.useState(false);
  if (items.length === 0) return null;
  const overflow = items.length > limit;
  const shown = expanded || !overflow ? items : items.slice(0, limit);
  return (
    <div data-slot="material-summary-group">
      <p className="mb-0.5 text-[11px] font-medium text-foreground">{label}</p>
      <ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
        {shown.map((item, i) => (
          <li key={`${label}-${i}`} className="flex gap-1">
            <span aria-hidden="true" className="text-brand">
              ·
            </span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
      {overflow ? (
        <button
          type="button"
          data-slot="material-summary-group-toggle"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-[11px] text-brand hover:underline"
        >
          {expanded ? "收起" : `展开全部 ${items.length} 条`}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 折叠优先的完整要点清单(三组)。inline 用在卡内 / 弹层内。
// ---------------------------------------------------------------------------
export function MaterialSummaryList({
  summary,
  limit = 3,
}: {
  readonly summary: MaterialSummaryData;
  readonly limit?: number;
}) {
  return (
    <div data-slot="material-summary-list" className="flex flex-col gap-2">
      <CollapsibleGroup
        label="核心要点"
        items={summary.keyPoints ?? []}
        limit={limit}
      />
      <CollapsibleGroup
        label="事实 / 数据"
        items={summary.facts ?? []}
        limit={limit}
      />
      <CollapsibleGroup
        label="卖点(原文已声明)"
        items={summary.sellingPoints ?? []}
        limit={limit}
      />
    </div>
  );
}

// 图片预览(块1 同款签名 URL);加载失败(onError)静默隐藏,不摆碎图。抽成独立组件 +
// 由父层 key=previewUrl 重挂,让 failed 状态随 URL 变化自动重置(不用 effect 手动同步)。
function ModalImage({ src, alt }: { readonly src: string; readonly alt: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      data-slot="material-modal-image"
      data-preview-type="image"
      className="max-h-[40vh] w-full rounded-control border border-border object-contain bg-surface-subtle"
    />
  );
}

// ---------------------------------------------------------------------------
// 「查看全文」Modal —— 完整资料要点 + 抽取全文 + 图片真图。
// ---------------------------------------------------------------------------
export function MaterialSummaryModal({
  open,
  onOpenChange,
  title,
  summary,
  fullText,
  previewUrl,
  sourceUrl,
  extractStatus,
  assetId,
  assetType,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly summary?: MaterialSummaryData | null;
  readonly fullText?: string | null;
  /** 图片素材签名预览 URL(块1 同款);非图片 / 取不到 → 不渲图。 */
  readonly previewUrl?: string | null;
  /** 网页正文来源；只读自 asset current file 的 sourceUrl 投影。 */
  readonly sourceUrl?: string | null;
  /** 当前文件的真实提取状态；项目素材与素材中心共用同一投影。 */
  readonly extractStatus?: string | null;
  /** 素材实体身份；提供后复用素材中心 AssetLivePreview，弹层打开时才换签名 URL。 */
  readonly assetId?: string | null;
  readonly assetType?: string | null;
}) {
  const hasCard = materialSummaryHasCard(summary);
  const text = fullText ?? "";
  const normalizedAssetType = asAssetType(assetType);
  const liveAsset: ResourceAsset | null =
    assetId && normalizedAssetType
      ? {
          id: assetId,
          name: title,
          type: normalizedAssetType,
          mimeType: "application/octet-stream",
          fileSizeBytes: 0,
          width: null,
          height: null,
          durationMs: null,
          tags: [],
          thumbnailToken: assetId,
          updatedAt: "",
        }
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="material-summary-modal"
        className="max-h-[85vh] overflow-hidden sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{title}</DialogTitle>
          <DialogDescription>
            {normalizedAssetType
              ? `${PREVIEW_TYPE_LABEL[normalizedAssetType]}预览`
              : "资料全文与要点(只提炼原文已有,不编造)"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-3 overflow-auto pr-1">
          {extractStatus ? (
            <p data-slot="material-modal-extract-status" className="text-[11px] text-text-subtle">
              提取状态：{extractStatus === "done" ? "已提取全文" : extractStatus}
            </p>
          ) : null}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              data-slot="material-modal-source"
              className="break-all text-[11px] text-brand underline underline-offset-2"
            >
              来源：{sourceUrl}
            </a>
          ) : null}
          {liveAsset ? (
            <AssetLivePreview asset={liveAsset} />
          ) : previewUrl ? (
            <ModalImage key={previewUrl} src={previewUrl} alt={title} />
          ) : null}
          {hasCard && summary ? (
            <MaterialSummaryList summary={summary} limit={Infinity} />
          ) : null}
          {text ? (
            <div data-slot="material-modal-fulltext">
              <p className="mb-1 text-[11px] font-medium text-foreground">全文</p>
              <pre className="whitespace-pre-wrap rounded-control bg-surface-subtle p-2 text-[11px] leading-relaxed text-muted-foreground">
                {text}
              </pre>
            </div>
          ) : null}
          {!liveAsset && !previewUrl && !hasCard && !text ? (
            <p className="text-[11px] text-muted-foreground">
              这份素材暂无可预览的内容。
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
