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
import styles from "./topics-prepare.module.css";
import Link from "next/link";
import {
  ArrowUpRight,
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
  description: string;
  icon: LucideIcon;
  prefill: string;
}> = [
  {
    basis: "positioning",
    label: "基于定位出题",
    description: "围绕账号方向",
    icon: Target,
    prefill: "基于我的定位和真实信号,出一批选题候选。",
  },
  {
    basis: "comments",
    label: "基于评论问题",
    description: "回应观众疑问",
    icon: MessageSquare,
    prefill: "基于我评论区的真实问题和求带信号,出一批选题候选。",
  },
  {
    basis: "knowledge",
    label: "基于知识库出题",
    description: "从资料中找切口",
    icon: BookOpen,
    prefill: "基于我知识库里的素材和沉淀,出一批选题候选。",
  },
  {
    basis: "trend",
    label: "基于热点出题",
    description: "结合热点找方向",
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
  const id = React.useId();
  return (
    <section data-testid="topics-generate-band" className={styles.aiPanel} aria-label="AI 选题会">
      <header className={styles.sectionHeader}><h3><Sparkles size={17} aria-hidden="true"/>让 AI 帮我找选题</h3><p>选择一种依据，进入对话后再发送。</p></header>
      <div data-testid="topics-generate-actions" className={styles.actions}>
        {GENERATE_ACTIONS.map(action => <Link key={action.basis}
          href={copilotDeepLink("topics", "topic.generate", undefined, action.prefill)}
          data-testid={`topics-generate-${action.basis}`} data-basis={action.basis}
          aria-label={action.label} aria-describedby={`${id}-${action.basis}`}>
          <action.icon size={18} aria-hidden="true"/>
          <span><strong>{action.label}</strong><small id={`${id}-${action.basis}`}>{action.description}</small></span>
          <ArrowUpRight size={15} aria-hidden="true"/>
        </Link>)}
      </div>
      <BasisPanel basis={basis}/>
    </section>
  );
}

// ── 当前依据 面板(读侧真数据,保留;[T-242] 收为内联 chips 一行) ─────────────────────
function BasisPanel({
  basis,
}: {
  readonly basis: TopicsOverviewResource["basis"];
}) {
  const rows: Array<{ key: string; icon: LucideIcon; label: string; value: string }> = [
    { key: "positioning", icon: Compass, label: "定位", value: basis.positioningLabel || "未设定" },
    { key: "comments", icon: MessageSquare, label: "评论信号", value: String(basis.commentSignals) },
    { key: "knowledge", icon: BookOpen, label: "知识卡", value: String(basis.knowledgeCards) },
    { key: "performers", icon: Flame, label: "高表现", value: String(basis.highPerformers) },
  ];
  return (
    <div data-testid="topics-basis-panel" className={styles.basis} role="group" aria-label="当前依据">
      <h4>当前依据</h4>
      {rows.map(row=><div key={row.key} data-basis-key={row.key}>
        <span><row.icon size={13} aria-hidden="true"/>{row.label}</span><strong>{row.value}</strong>
      </div>)}
    </div>
  );
}
