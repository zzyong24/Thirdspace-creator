"use client";

/**
 * `ReviewAnalyzeIsland` — the 复盘 node (review.analyze), a thin wrapper over the shared
 * `AdoptCandidateCard`. AI extracts reusable 爆款要素/方法论 → 采纳 → Learnings, which then
 * feed back into the next 选题会/脚本 (机制⑤ flywheel). Demonstrates the bus once more.
 */

import * as React from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";

interface LearningItem {
  title: string;
  insight: string;
}

function parseLearnings(resultData: Record<string, unknown>): LearningItem[] {
  const items = Array.isArray(resultData.items) ? resultData.items : [];
  return items
    .map((raw): LearningItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title : "";
      if (!title) return null;
      return { title, insight: typeof o.insight === "string" ? o.insight : "" };
    })
    .filter((l): l is LearningItem => l !== null);
}

function renderLearning(l: LearningItem) {
  return (
    <div className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      <span className="font-medium leading-snug text-foreground">{l.title}</span>
      {l.insight ? (
        <span className="text-xs text-muted-foreground">{l.insight}</span>
      ) : null}
    </div>
  );
}

export function ReviewAnalyzeIsland({
  projectId,
  topic,
}: {
  projectId: string;
  topic?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <AdoptCandidateCard<LearningItem>
        title="AI 复盘"
        description="提炼可复用的爆款要素 → 沉淀经验,回喂下一轮选题"
        startLabel="帮我复盘"
        runningLabel="复盘 agent 正在提炼爆款要素…"
        taskType="review.analyze"
        inputData={{ projectId, topic: topic ?? "" }}
        parseItems={parseLearnings}
        renderItem={renderLearning}
        adoptLabel={(n) => `采纳全部（${n}）入经验沉淀`}
        doneLabel={(n) => `已沉淀 ${n} 条经验（将回喂选题）。`}
      />
      {/* 一键岛预调(SPEC §3.4):打开 ChatBox 进复盘编导,预调 review.analyze(边聊边提炼经验)。 */}
      <Link
        href={copilotDeepLink("review", "review.analyze")}
        data-testid="review-open-copilot"
        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-control border border-brand/30 bg-surface px-3 text-xs font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft/60"
      >
        <MessagesSquare className="size-4" />
        在对话里复盘
      </Link>
    </div>
  );
}
