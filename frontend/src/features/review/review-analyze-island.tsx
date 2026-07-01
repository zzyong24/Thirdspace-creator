"use client";

/**
 * `ReviewAnalyzeIsland` — 复盘入口,单按钮「帮我复盘」。点击打开 ChatBox 进复盘编导
 * (copilotDeepLink → review.analyze),默认就在对话里边聊边提炼可复用的爆款要素/经验,
 * 采纳后沉淀 Learnings 回喂下一轮选题/脚本(机制⑤ flywheel)。
 *
 * 早期这里是「内联跑 review.analyze 的 AdoptCandidateCard」+「在对话里复盘 Link」两块;
 * 按产品要求合并为一个按钮:文案「帮我复盘」,实际效果=在对话里复盘。
 */

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";

export function ReviewAnalyzeIsland({
  projectId,
  topic,
}: {
  projectId: string;
  topic?: string;
}) {
  return (
    <Link
      href={copilotDeepLink("review", "review.analyze", {
        kind: "project",
        id: projectId,
        ...(topic ? { title: topic } : {}),
      })}
      data-testid="review-open-copilot"
      className="inline-flex h-9 w-fit items-center gap-1.5 rounded-control border border-brand/30 bg-brand-soft/50 px-4 text-sm font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft"
    >
      <Sparkles className="size-4" />
      帮我复盘
    </Link>
  );
}
