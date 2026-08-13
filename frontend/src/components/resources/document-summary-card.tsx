"use client";

/**
 * 文档「资料要点卡」(T-146 切片 a SPEC §1.3;T-146 UI 改造:折叠优先 + 「查看全文」用
 * Modal 替原生 <details>,并抽成共用 client 组件供素材中心详情面板 + 稿面弹药预览复用)。
 *
 * 只对 document 类素材渲染,按抽取状态诚实降级:
 *   - done + materialSummary  → 折叠优先的要点清单(前 3 条 + 就地展开)+「查看全文」Modal。
 *   - done 但无要点卡          → 只显「查看全文」(未配摘要模型的诚实降级:全文在,卡没生成)。
 *   - failed                   → 诚实提示「无法自动解析(可能扫描件/加密),AI 将读不到内容」。
 *   - unsupported              → 诚实提示「不支持自动解析的文档类型」。
 *   - pending / 无状态         → 「正在解析…」占位(异步抽取尚未回)。
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Button } from "@/components/ui/button";
import {
  MaterialSummaryList,
  MaterialSummaryModal,
  materialSummaryHasCard,
} from "@/components/resources/material-summary";
import type { ResourceAsset } from "@/components/resources/types";

export function DocumentSummaryCard({ asset }: { asset: ResourceAsset }) {
  const status = asset.extractStatus ?? null;
  const summary = asset.materialSummary ?? null;
  const hasCard = materialSummaryHasCard(summary);
  const fullText = asset.extractedText ?? "";
  const [modalOpen, setModalOpen] = React.useState(false);

  if (status === "failed") {
    return (
      <SectionCard title="资料要点" description="AI 抽取" className="gap-1.5">
        <p
          data-slot="doc-extract-failed"
          className="text-[11px] leading-relaxed text-destructive"
        >
          无法自动解析该文档的文本(可能是扫描件 / 加密 / 损坏)。AI 将读不到它的内容,
          写文案时无法紧扣这份资料。
        </p>
      </SectionCard>
    );
  }
  if (status === "unsupported") {
    return (
      <SectionCard title="资料要点" description="AI 抽取" className="gap-1.5">
        <p
          data-slot="doc-extract-unsupported"
          className="text-[11px] leading-relaxed text-muted-foreground"
        >
          不支持自动解析的文档类型(如旧版 .doc)。请转存为 PDF / DOCX / Markdown 再传。
        </p>
      </SectionCard>
    );
  }
  if (status !== "done") {
    // pending / null:异步抽取尚未回。
    return (
      <SectionCard title="资料要点" description="AI 抽取" className="gap-1.5">
        <p
          data-slot="doc-extract-pending"
          className="text-[11px] text-muted-foreground"
        >
          正在解析文档并提炼要点…
        </p>
      </SectionCard>
    );
  }

  // status === "done"
  return (
    <SectionCard
      title="资料要点"
      description="AI 从这份第一手资料提炼(只提炼原文已有,不编造)"
      className="gap-1.5"
    >
      <div data-slot="doc-material-summary" className="flex flex-col gap-2">
        {hasCard && summary ? (
          // [T-146] 折叠优先:每组前 3 条 + 就地展开(共用件),不再一屏全展开。
          <MaterialSummaryList summary={summary} limit={3} />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            已抽取全文,但未生成要点卡(可在设置页配置文本摘要模型)。
          </p>
        )}
        {fullText || hasCard ? (
          // [T-146] 「查看全文」用 ui/dialog Modal 替原生 <details>:完整要点 + 全文在 Modal 内。
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-slot="doc-view-full"
            onClick={() => setModalOpen(true)}
            className="self-start"
          >
            查看全文
          </Button>
        ) : null}
      </div>
      <MaterialSummaryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={asset.name}
        summary={summary}
        fullText={fullText}
        previewUrl={null}
        sourceUrl={asset.sourceUrl ?? null}
        extractStatus={asset.extractStatus ?? null}
      />
    </SectionCard>
  );
}
