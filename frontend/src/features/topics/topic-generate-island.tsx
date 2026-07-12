"use client";

/**
 * `TopicGenerateBand` — 选题中心「AI 选题会」触发带(T-060①,弹窗任务流退役)。
 *
 * 旧形态:4 出题按钮 → createAITask → `TopicReviewDialog` 居中弹窗(运行步骤日志 +
 * 候选审阅 + 采纳)。用户裁决:**禁止 agent 运行时弹窗对话,全部走 Copilot** ——
 * 4 按钮改为 Copilot 深链预填(每种依据一句定制话术,预填不自动发),模型调
 * topic.generate 工具产 ChatCandidateCard,逐条采纳(同一确认门,对话内完成)。
 *
 * BasisPanel(当前依据真数据面板)保留 —— 它是读侧事实,不是任务流。
 *
 * [T-242] 整带收窄为**一行紧凑排布**(标题 + 4 深链小按钮 + 内联依据 chips):它已是
 * 「手动加餐」定位,不与候选池三栏抢视觉权重 —— 候选池是页面 C 位。
 */

import * as React from "react";
import Link from "next/link";
import {
  BookOpen,
  Compass,
  Flame,
  MessageSquare,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

import type { TopicsOverviewResource } from "@creatoros/backend/modules/candidate";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";

// 4 种出题依据 → Copilot 预填话术(点开即填,回车才发;模型据话术选 basis 调 topic.generate)。
const GENERATE_ACTIONS: ReadonlyArray<{
  basis: string;
  label: string;
  icon: LucideIcon;
  prefill: string;
}> = [
  {
    basis: "positioning",
    label: "基于定位出题",
    icon: Target,
    prefill: "基于我的定位和真实信号,出一批选题候选。",
  },
  {
    basis: "comments",
    label: "基于评论问题",
    icon: MessageSquare,
    prefill: "基于我评论区的真实问题和求带信号,出一批选题候选。",
  },
  {
    basis: "knowledge",
    label: "基于知识库出题",
    icon: BookOpen,
    prefill: "基于我知识库里的素材和沉淀,出一批选题候选。",
  },
  {
    basis: "trend",
    label: "基于热点出题",
    icon: Flame,
    prefill: "结合当下热点和我的定位,出一批蹭得住的选题候选。",
  },
];

export function TopicGenerateBand({
  basis,
}: {
  readonly basis: TopicsOverviewResource["basis"];
  /** @deprecated 弹窗任务流已退役(T-060①);保留形参兼容旧调用,不再消费。 */
  readonly pendingReview?: unknown;
}) {
  return (
    // [T-242] 一行紧凑排布:标题 + 4 深链小按钮 + 内联依据 chips(窄屏 wrap 换行,不撑高)。
    <section
      data-testid="topics-generate-band"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-surface px-3 py-2"
    >
      <span className="flex shrink-0 items-center gap-1.5">
        <Sparkles className="size-4 text-brand" aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">AI 选题会</span>
        <span className="hidden text-[11px] text-text-subtle 2xl:inline">
          手动加餐 —— 挑一种依据开聊,逐条采纳进候选池
        </span>
      </span>
      <div
        data-testid="topics-generate-actions"
        className="flex flex-wrap items-center gap-1.5"
      >
        {GENERATE_ACTIONS.map((a) => (
          <Link
            key={a.basis}
            href={copilotDeepLink("topics", "topic.generate", undefined, a.prefill)}
            data-testid={`topics-generate-${a.basis}`}
            data-basis={a.basis}
            className="flex items-center gap-1.5 rounded-control border border-border bg-surface-subtle/60 px-2.5 py-1.5 transition-colors hover:border-brand/50 hover:bg-brand-soft/40"
          >
            <a.icon className="size-3.5 text-brand" aria-hidden="true" />
            <span className="text-xs font-medium text-foreground">
              {a.label}
            </span>
          </Link>
        ))}
      </div>
      <BasisPanel basis={basis} />
    </section>
  );
}

// ── 当前依据 面板(读侧真数据,保留;[T-242] 收为内联 chips 一行) ─────────────────────
function BasisPanel({
  basis,
}: {
  readonly basis: TopicsOverviewResource["basis"];
}) {
  const rows: Array<{ icon: LucideIcon; label: string; value: string }> = [
    { icon: Compass, label: "定位", value: basis.positioningLabel || "未设定" },
    { icon: MessageSquare, label: "评论信号", value: String(basis.commentSignals) },
    { icon: BookOpen, label: "知识卡", value: String(basis.knowledgeCards) },
    { icon: Flame, label: "高表现", value: String(basis.highPerformers) },
  ];
  return (
    <div
      data-testid="topics-basis-panel"
      className="ml-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">
        当前依据
      </span>
      {rows.map((r) => (
        <span key={r.label} className="flex items-center gap-1 text-[11px]">
          <r.icon className="size-3 shrink-0 text-brand" aria-hidden="true" />
          <span className="text-text-subtle">{r.label}</span>
          <span className="max-w-[140px] truncate font-medium text-foreground">
            {r.value}
          </span>
        </span>
      ))}
    </div>
  );
}
