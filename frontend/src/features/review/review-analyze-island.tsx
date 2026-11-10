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
  "复盘当前作品：先调用复盘工具，再按固定结构交付——①一句话结论；②下一条的 3 条可执行改动（每条写清改哪里、怎么改、看哪个指标验证）；③1–3 条可一键采纳的经验候选，写清适用条件；证据不足时写成「待验证做法」候选并标明要验证什么，不要空着。结合真实稿件、指标及流量来源；没有表现数据时只诊断内容，不作效果归因，不把相关当因果。全程使用简体中文，不输出「我先读取…/接下来…」之类的过程旁白，过程交给工具卡展示。";

export function ReviewAnalyzeButton({
  projectId,
  projectTitle,
  className,
  slot,
  analysisScope,
}: {
  projectId: string;
  projectTitle?: string;
  className?: string;
  slot?: string;
  analysisScope?: string;
}) {
  const { openChat } = useDraftChatRequest();
  return (
    <button
      type="button"
      data-slot={slot}
      onClick={() =>
        openChat({
          functionKey: "review.analyze",
          prefill: REVIEW_ANALYZE_PREFILL+(analysisScope?`\n本次明确选择的复盘范围：${analysisScope}。按各平台原生口径分别说明来源、样本与未知项，不合并不同平台的比例；效果判断只使用此范围。`:''),
          autoSend: true,
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
  analysisScope,
}: {
  projectId: string;
  projectTitle?: string;
  analysisScope?: string;
}) {
  return (
    <ReviewAnalyzeButton
      projectId={projectId}
      projectTitle={projectTitle}
      analysisScope={analysisScope}
      className="h-9 w-fit px-4 text-sm"
      slot="review-analyze-primary"
    />
  );
}
