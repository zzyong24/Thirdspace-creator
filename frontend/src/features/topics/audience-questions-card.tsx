/**
 * `AudienceQuestionsCard` — 「评论区 & 客户问题」panel (七步③ · SPEC §5.5).
 *
 * Server component: renders the aggregated 受众信号 (read from `audienceSignals.list`
 * by the page) and, per row, a「一键转 Candidate」client island. Answers spec §9.2
 * 「最近用户在评论里反复问什么？」.
 *
 * Determinism (C-5): values come from props; no Date.now / Math.random / fetch.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import type { AudienceSignalResource } from "@/server/modules/candidate";

import { LinkSignalButton } from "./audience-questions-interactive-region";

const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  comment: "评论",
  dm: "私信",
  consultation: "咨询",
  review: "评价",
};

export function AudienceQuestionsCard({
  signals,
}: {
  readonly signals: AudienceSignalResource[];
}) {
  // unlinked signals are the actionable backlog (一键转 Candidate); linked ones are
  // already feeding a candidate's demand_count.
  return (
    <SectionCard title="评论区 & 客户问题">
      <ul
        data-testid="audience-signal-list"
        className="flex flex-col gap-2 py-2"
      >
        {signals.length === 0 ? (
          <li
            data-testid="audience-signal-empty-state"
            className="text-sm text-muted-foreground"
          >
            还没有受众信号。等抖音评论 / 飞书问卷经 Ingestion 写入。
          </li>
        ) : (
          signals.map((s) => (
            <li
              key={s.id}
              data-testid="audience-signal-row"
              data-source={s.source}
              data-linked={s.linkedCandidateId ? "true" : "false"}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {SIGNAL_SOURCE_LABELS[s.source] ?? s.source}
                </Badge>
                <span className="truncate text-foreground">{s.rawText}</span>
                {s.demandTag ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {s.demandTag}
                  </Badge>
                ) : null}
              </span>
              {s.linkedCandidateId ? (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  已转候选
                </Badge>
              ) : (
                <LinkSignalButton signalId={s.id} />
              )}
            </li>
          ))
        )}
      </ul>
    </SectionCard>
  );
}
