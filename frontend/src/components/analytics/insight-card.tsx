/**
 * `InsightCard` (SPEC §7, 分析) renders a card of AI-generated insight
 * items (title + body) derived from review data. It is a deterministic
 * presentational component; the caller supplies the `items`.
 *
 * Server component: no interactivity.
 */

import * as React from "react";

export interface InsightItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface InsightCardProps {
  readonly items: ReadonlyArray<InsightItem>;
}

export function InsightCard({ items }: InsightCardProps) {
  return (
    <article
      data-slot="ai-analysis-card"
      aria-label="AI 分析"
      data-overlay="false"
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-card-gap shadow-card"
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-md font-semibold text-foreground">AI 分析</h3>
        <p className="text-xs text-muted-foreground">基于本期复盘数据的要点</p>
      </header>
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
            <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}
