"use client";

/**
 * `TopicGenerateIsland` — the 选题会 node (topic.generate), a thin wrapper over the shared
 * `AdoptCandidateCard`. AI proposes scored topic candidates from the creator's positioning
 * (+ past 复盘 爆款要素); 采纳 → each becomes a real Candidate in the 选题池. Demonstrates
 * the reusable bus: this whole node is ~one render function + a parse.
 */

import * as React from "react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";

interface TopicItem {
  title: string;
  angle: string;
  contentRole: string;
  source: string;
  predictedScore: number | null;
  reason: string;
}

const ROLE_LABEL: Record<string, string> = {
  traffic: "引流",
  trust: "信任",
  conversion: "转化",
  引流: "引流",
  信任: "信任",
  转化: "转化",
};

function parseTopics(resultData: Record<string, unknown>): TopicItem[] {
  const items = Array.isArray(resultData.items) ? resultData.items : [];
  return items
    .map((raw): TopicItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title : "";
      if (!title) return null;
      return {
        title,
        angle: typeof o.angle === "string" ? o.angle : "",
        contentRole: typeof o.contentRole === "string" ? o.contentRole : "",
        source: typeof o.source === "string" ? o.source : "",
        predictedScore:
          typeof o.predictedScore === "number" ? o.predictedScore : null,
        reason: typeof o.reason === "string" ? o.reason : "",
      };
    })
    .filter((t): t is TopicItem => t !== null);
}

function renderTopic(t: TopicItem) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium leading-snug text-foreground">
          {t.title}
        </span>
        {t.predictedScore !== null ? (
          <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
            爆款潜力 {t.predictedScore}
          </span>
        ) : null}
        {ROLE_LABEL[t.contentRole] ? (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {ROLE_LABEL[t.contentRole]}
          </span>
        ) : null}
      </div>
      {t.angle ? (
        <span className="text-xs text-muted-foreground">切入：{t.angle}</span>
      ) : null}
      {t.reason ? (
        <span className="text-[11px] text-text-subtle">{t.reason}</span>
      ) : null}
    </div>
  );
}

export function TopicGenerateIsland() {
  return (
    <AdoptCandidateCard<TopicItem>
      title="AI 选题会"
      description="按你的定位 + 过往爆款要素,联网出打分选题"
      startLabel="帮我出选题"
      runningLabel="选题 agent 正在看热点/对标并按定位打分（可能要一两分钟）…"
      taskType="topic.generate"
      inputData={{}}
      parseItems={parseTopics}
      renderItem={renderTopic}
      adoptLabel={(n) => `采纳全部（${n}）入选题池`}
      doneLabel={(n) => `已采纳 ${n} 条进选题池。`}
    />
  );
}
