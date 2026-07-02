"use client";

/**
 * `PlanningContractIsland` — the Planning stage's 内容合同 node (planning.contract), a thin
 * wrapper over the reusable `AdoptCandidateCard` (机制③). It supplies only this node's
 * specifics: the taskType, the inputData (projectId + artifactId + topic), and how to
 * parse/render the drafted contract cards. The createAITask→poll→采纳 loop lives in
 * AdoptCandidateCard.
 *
 * On 采纳, the AI service's EXISTING artifact_version confirm branch appends a NEW
 * ArtifactVersion (createdByType:"ai") onto the project's `content_contract` artifact — the
 * candidate carried `artifactId` + `resultData.body`/`summary`/`contentData`, so no new
 * confirm path is needed. The 策划 workspace then reads that version's `contentData.cards`
 * back into the 内容合同 surface (planning-workspace-data.ts).
 */

import * as React from "react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";
import { ensurePlanningArtifact } from "@/features/planning/ensure-planning-artifact";

interface ContractCardItem {
  id: string;
  title: string;
  body: string;
}

function parseCards(resultData: Record<string, unknown>): ContractCardItem[] {
  const items = Array.isArray(resultData.cards) ? resultData.cards : [];
  return items
    .map((raw): ContractCardItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const title = typeof o.title === "string" ? o.title : "";
      const body = typeof o.body === "string" ? o.body : "";
      if (!title && !body) return null;
      return { id, title, body };
    })
    .filter((c): c is ContractCardItem => c !== null);
}

function renderCard(card: ContractCardItem) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      {card.title ? (
        <span className="font-medium leading-snug text-foreground">
          {card.title}
        </span>
      ) : null}
      {card.body ? (
        <span className="text-xs leading-relaxed text-muted-foreground">
          {card.body}
        </span>
      ) : null}
    </div>
  );
}

export function PlanningContractIsland({
  projectId,
  artifactId,
  topic,
}: {
  projectId: string;
  /** [T-049 B12] 可空:SSR 只查不建,无 artifact 时由 prepareInput 在首次起草时创建。 */
  artifactId: string | null;
  topic: string;
}) {
  return (
    <AdoptCandidateCard<ContractCardItem>
      title="AI 内容合同"
      description="按你的定位 + 论点树,生成受众定位/价值主张/核心节奏/行动召唤四项承诺"
      startLabel="帮我生成内容合同"
      runningLabel="策划 agent 正在拟内容合同（可能要一两分钟）…"
      taskType="planning.contract"
      inputData={{ projectId, topic }}
      prepareInput={() =>
        ensurePlanningArtifact(projectId, "content_contract", "内容合同", artifactId)
      }
      parseItems={parseCards}
      renderItem={renderCard}
      adoptLabel={(n) => `采纳为新版本（${n} 项承诺）`}
      doneLabel={() => "已采纳为内容合同新版本。"}
    />
  );
}
