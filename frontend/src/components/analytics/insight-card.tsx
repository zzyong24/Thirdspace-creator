/**
 * `InsightCard` (SPEC §7, 分析) renders a card of AI-generated insight
 * items (title + body) derived from THIS video's review analysis.
 *
 * [T-116c] 真·本期专属:items 来自本条视频(projectId)最近一次 review.analyze 复盘分析的
 * learning_list 结果(装配见 review-workspace-data.readProjectReviewInsights),不再挂
 * 全站 learnings。空 items = 本视频还没跑过复盘分析 → 渲诚实空态 + 「帮我复盘」CTA
 * (指向既有 Copilot review.analyze 链路),绝不回退全站数据假充本期(宪法 §8)。
 *
 * Server component: no interactivity (CTA 是 Next.js <Link>,就地开 Copilot 浮层)。
 */

import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";

export interface InsightItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface InsightCardProps {
  readonly items: ReadonlyArray<InsightItem>;
  /**
   * [T-116c] 本条视频 id —— 空态 CTA「帮我复盘」深链要用它把复盘对象钉到这条视频。
   * 省略(fixture-only 渲染)时空态只显文案、不渲 CTA。
   */
  readonly projectId?: string;
}

export function InsightCard({ items, projectId }: InsightCardProps) {
  const isEmpty = items.length === 0;
  return (
    <article
      data-slot="ai-analysis-card"
      aria-label="AI 分析"
      data-overlay="false"
      data-empty={isEmpty ? "true" : "false"}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card-gap shadow-card"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-foreground">AI 分析</h3>
        {/* [T-116c] 诚实标题:要点来自本条视频的复盘分析,不再写「本期复盘数据」这种
            在全站数据上撒谎的话。 */}
        <p className="text-xs text-muted-foreground">基于本条视频的复盘分析</p>
      </header>
      {isEmpty ? (
        <div
          data-slot="ai-analysis-empty"
          className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border bg-surface-subtle px-3 py-4"
        >
          <p className="text-[12px] font-medium text-foreground">
            本条视频还没生成 AI 复盘要点
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            点「帮我复盘」让编导基于本期评论 / 指标现产要点,采纳后沉淀成经验。
          </p>
          {projectId ? (
            <Link
              href={copilotDeepLink("review", "review.analyze", {
                kind: "project",
                id: projectId,
              })}
              data-slot="ai-analysis-cta"
              className="inline-flex h-7 w-fit items-center gap-1.5 rounded-control border border-brand/30 bg-brand-soft/50 px-3 text-[11px] font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft"
            >
              <Sparkles className="size-3.5" />
              帮我复盘
            </Link>
          ) : null}
        </div>
      ) : (
        <ul
          data-slot="ai-analysis-list"
          className="flex flex-col gap-1.5"
          aria-label="AI 分析要点"
        >
          {items.map((item) => (
            <li
              key={item.id}
              data-slot="ai-analysis-item"
              data-analysis-id={item.id}
              className="rounded-md border border-border bg-surface-subtle p-3 text-sm"
            >
              <div className="text-sm font-medium text-foreground">
                {item.title}
              </div>
              {item.body ? (
                <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
