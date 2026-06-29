"use client";

/**
 * `PlanningOutlineIsland` — the Planning stage's 结构方案 node (planning.outline), a thin
 * wrapper over the reusable `AdoptCandidateCard` (机制③). It supplies only this node's
 * specifics: the taskType, the inputData (projectId + artifactId + topic), and how to
 * parse/render the drafted structure plan. The createAITask→poll→采纳 loop lives in
 * AdoptCandidateCard.
 *
 * On 采纳, the AI service's EXISTING artifact_version confirm branch appends a NEW
 * ArtifactVersion (createdByType:"ai") onto the project's `content_outline` artifact — the
 * candidate carried `artifactId` + `resultData.body`/`summary`/`contentData`, so no new
 * confirm path is needed. This is the 脚本 stage's entry ticket: the structure the script
 * fleshes out.
 *
 * The outline is ONE object (not a list), so the card renders a single review row carrying
 * the structure type + the ordered sections.
 */

import * as React from "react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";

interface OutlineSection {
  label: string;
  intent: string;
}

interface OutlineItem {
  structureType: string;
  opening: string;
  sections: OutlineSection[];
  ending: string;
  cta: string;
}

// The outline candidate is a single object; surface it as a one-item array so the
// AdoptCandidateCard review list renders exactly one structure-plan row.
function parseOutline(resultData: Record<string, unknown>): OutlineItem[] {
  const rawSections = Array.isArray(resultData.sections)
    ? resultData.sections
    : [];
  const sections = rawSections
    .map((raw): OutlineSection | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label : "";
      const intent = typeof o.intent === "string" ? o.intent : "";
      if (!label && !intent) return null;
      return { label, intent };
    })
    .filter((s): s is OutlineSection => s !== null);
  const structureType =
    typeof resultData.structureType === "string"
      ? resultData.structureType
      : "";
  if (!structureType && sections.length === 0) return [];
  return [
    {
      structureType,
      opening: typeof resultData.opening === "string" ? resultData.opening : "",
      sections,
      ending: typeof resultData.ending === "string" ? resultData.ending : "",
      cta: typeof resultData.cta === "string" ? resultData.cta : "",
    },
  ];
}

function renderOutline(outline: OutlineItem) {
  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      {outline.structureType ? (
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
            结构类型
          </span>
          <span className="font-medium leading-snug text-foreground">
            {outline.structureType}
          </span>
        </div>
      ) : null}
      {outline.opening ? (
        <span className="text-xs text-muted-foreground">
          开头：{outline.opening}
        </span>
      ) : null}
      {outline.sections.length > 0 ? (
        <ol className="flex flex-col gap-0.5 pl-1">
          {outline.sections.map((s, i) => (
            <li key={i} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {i + 1}. {s.label || `段落 ${i + 1}`}
              </span>
              {s.intent ? `：${s.intent}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
      {outline.ending ? (
        <span className="text-xs text-muted-foreground">
          结尾：{outline.ending}
        </span>
      ) : null}
      {outline.cta ? (
        <span className="text-[11px] text-text-subtle">CTA：{outline.cta}</span>
      ) : null}
    </div>
  );
}

export function PlanningOutlineIsland({
  projectId,
  artifactId,
  topic,
}: {
  projectId: string;
  artifactId: string;
  topic: string;
}) {
  return (
    <AdoptCandidateCard<OutlineItem>
      title="AI 结构方案"
      description="按内容合同 + 论点树,生成结构类型/开头/段落安排/结尾/CTA —— 脚本阶段的入口票"
      startLabel="帮我生成结构方案"
      runningLabel="策划 agent 正在编排结构方案（可能要一两分钟）…"
      taskType="planning.outline"
      inputData={{ projectId, artifactId, topic }}
      parseItems={parseOutline}
      renderItem={renderOutline}
      adoptLabel={() => "采纳为新版本"}
      doneLabel={() => "已采纳为结构方案新版本。"}
    />
  );
}
