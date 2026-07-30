"use client";

/**
 * `ReviewAnalyzeIsland` — 复盘入口,单按钮「帮我复盘」。点击把 review.analyze 话术预填
 * 进项目页既有编导右栏,默认就在同一条对话里提炼可复用的爆款要素/经验,
 * 采纳后沉淀 Learnings 回喂下一轮选题/脚本(机制⑤ flywheel)。
 *
 * 早期这里是「内联跑 review.analyze 的 AdoptCandidateCard」+「在对话里复盘 Link」两块;
 * 按产品要求合并为一个按钮:文案「帮我复盘」,实际效果=在对话里复盘。
 */

import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { useDraftChatRequest } from "@/features/draft-workbench/draft-chat-request";

export const REVIEW_ANALYZE_PREFILL =
  "帮我复盘,提炼可复用的爆款要素沉淀成经验。";

export function ReviewAnalyzeButton({
  projectId,
  projectTitle,
  className,
  slot,
}: {
  projectId: string;
  projectTitle?: string;
  className?: string;
  slot?: string;
}) {
  const { openChat } = useDraftChatRequest();
  return (
    <button
      type="button"
      data-slot={slot}
      onClick={() =>
        openChat({
          functionKey: "review.analyze",
          prefill: REVIEW_ANALYZE_PREFILL,
          autoSend: false,
          selection: {
            kind: "project",
            id: projectId,
            ...(projectTitle ? { title: projectTitle } : {}),
          },
        })
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control border border-brand/30 bg-brand-soft/50 font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft",
        className,
      )}
    >
      <Sparkles className="size-4" />
      帮我复盘
    </button>
  );
}

export function ReviewAnalyzeIsland({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle?: string;
}) {
  return (
    <ReviewAnalyzeButton
      projectId={projectId}
      projectTitle={projectTitle}
      className="h-9 w-fit px-4 text-sm"
      slot="review-analyze-primary"
    />
  );
}
