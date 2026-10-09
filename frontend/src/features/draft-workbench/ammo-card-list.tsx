"use client";

/**
 * 稿面内容弹药·卡片列表 + 双击预览(T-146)。
 *
 * 弹药区显示本项目已上传素材/知识(读 material_links 反查,VM 已投影 previewUrl +
 * 文档抽取要点/全文)。**双击**某张弹药卡 → 开预览 Modal:
 *   - 图片素材(previewUrl)→ Modal 顶部渲真图(块1 同款签名 URL,onError 静默隐藏)。
 *   - 文档素材(materialSummary/extractedText)→ 显完整资料要点 + 抽取全文。
 *   - 知识手记 / 无可预览内容 → Modal 显标题 + 来源 + 诚实空态。
 * 预览 Modal 复用素材中心同款 `MaterialSummaryModal`(共用件,一处改动两处生效)。
 * 移除按钮(AmmoRemoveButton)的点击不冒泡触发双击预览(stopPropagation)。
 */

import * as React from "react";

import { AmmoRemoveButton } from "./ammo-remove-button";
import { MaterialSummaryModal } from "@/components/resources/material-summary";
import type { DraftWorkbenchVm } from "./draft-workbench-data";
import { KnowledgeDetailPreview } from "@/features/knowledge/knowledge-detail-preview";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type AmmoItem = DraftWorkbenchVm["ammo"][number];

export function AmmoCardList({
  ammo,
  readError,
}: {
  ammo: DraftWorkbenchVm["ammo"];
  readError?: string | null;
}) {
  const router = useRouter();
  const [previewItem, setPreviewItem] = React.useState<AmmoItem | null>(null);

  const [page, setPage] = React.useState(1);
  const pageCount = Math.max(1, Math.ceil(ammo.length / 12));
  const currentPage = Math.min(page, pageCount);
  const currentPreview =
    ammo.find((x) => x.linkId === previewItem?.linkId) ?? null;
  return (
    <>
      {readError && (
        <div role="alert" className="mb-3 text-sm text-destructive">
          <p>{readError}</p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => router.refresh()}
          >
            重新读取项目资料
          </Button>
        </div>
      )}
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {ammo.slice((currentPage - 1) * 12, currentPage * 12).map((item) => (
          <div
            key={`${item.kind}-${item.id}`}
            data-slot="draft-ammo-card"
            data-kind={item.kind}
            role="button"
            tabIndex={0}
            aria-label={`预览 ${item.title}`}
            onClick={() => setPreviewItem(item)}
            onDoubleClick={() => setPreviewItem(item)}
            onKeyDown={(e) => {
              // 键盘可达:Enter / Space 等效双击开预览。
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPreviewItem(item);
              }
            }}
            className="w-[220px] shrink-0 cursor-pointer rounded-[10px] border border-border bg-surface px-3 py-2.5 transition-colors hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {/* [T-058④] 图片素材直接给缩略图预览;非图片退回类型徽标。 */}
            {item.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewUrl}
                alt={item.title}
                data-slot="ammo-preview"
                className="mb-1.5 h-20 w-full rounded-md border border-border object-cover"
              />
            ) : null}
            <div className="mb-1 flex items-center justify-between gap-1">
              <p
                className={cn(
                  "text-[10.5px] font-bold tracking-wide",
                  item.kind === "knowledge" ? "text-warning" : "text-info",
                )}
              >
                {item.kind === "knowledge" ? "知识" : "素材"}
              </p>
              {/* [T-109] 移除:解绑本条与项目的关联(系统 Dialog 二次确认,不删实体)。
                  包一层 stopPropagation,移除交互不误触双击预览。 */}
              <span
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <AmmoRemoveButton
                  linkId={item.linkId}
                  kind={item.kind}
                  title={item.title}
                />
              </span>
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
              {item.title}
            </p>
            <p className="mt-1.5 truncate text-[11px] text-text-subtle">
              ↳ {item.sourceLabel}
            </p>
            <p className="mt-1 text-[10px] text-text-subtle/70">点击阅读</p>
          </div>
        ))}
      </div>
      {pageCount > 1 && (
        <nav aria-label="项目资料分页" className="mt-2 flex items-center gap-3">
          <Button
            variant="outline"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            上一页项目资料
          </Button>
          <span>
            {currentPage} / {pageCount} · {ammo.length} 份
          </span>
          <Button
            variant="outline"
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            下一页项目资料
          </Button>
        </nav>
      )}
      <Dialog
        open={currentPreview?.kind === "knowledge"}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>{currentPreview?.title}</DialogTitle>
          <DialogDescription>项目引用的资料原文</DialogDescription>
          {currentPreview?.kind === "knowledge" && (
            <KnowledgeDetailPreview
              key={currentPreview.id}
              knowledgeId={currentPreview.id}
              reader
            />
          )}
        </DialogContent>
      </Dialog>
      {/* 双击预览 Modal —— 复用素材中心同款共用件。 */}
      <MaterialSummaryModal
        open={currentPreview !== null && currentPreview.kind === "asset"}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
        title={previewItem?.title ?? ""}
        summary={previewItem?.materialSummary ?? null}
        fullText={previewItem?.extractedText ?? null}
        previewUrl={previewItem?.previewUrl ?? null}
        sourceUrl={previewItem?.sourceUrl ?? null}
        extractStatus={previewItem?.extractStatus ?? null}
        assetId={previewItem?.kind === "asset" ? previewItem.id : null}
        assetType={previewItem?.assetType ?? null}
      />
    </>
  );
}
