"use client";

/**
 * `PlanningThesisIsland` — the Planning stage's 论点树 node (planning.thesis), a thin
 * wrapper over the reusable `AdoptCandidateCard` (机制③). It supplies only this node's
 * specifics: the taskType, the inputData (projectId + artifactId + topic), and how to
 * parse/render the drafted thesis nodes. The createAITask→poll→采纳 loop lives in
 * AdoptCandidateCard.
 *
 * On 采纳, the AI service's EXISTING artifact_version confirm branch appends a NEW
 * ArtifactVersion (createdByType:"ai") onto the project's `thesis_tree` artifact — the
 * candidate carried `artifactId` + `resultData.body`/`summary`/`contentData`, so no new
 * confirm path is needed. The 策划 workspace then reads that version's
 * `contentData.nodes` back into the 论点树 surface (planning-workspace-data.ts).
 */

import * as React from "react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";

type ThesisColumn = "core" | "support" | "evidence" | "counter";

interface ThesisNode {
  column: ThesisColumn;
  title: string;
  summary: string;
}

const COLUMN_LABEL: Record<ThesisColumn, string> = {
  core: "核心论点",
  support: "支撑依据",
  evidence: "证据",
  counter: "反驳",
};

const COLUMN_TONE: Record<ThesisColumn, string> = {
  core: "bg-brand-soft text-brand",
  support: "bg-surface-subtle text-foreground",
  evidence: "bg-surface-subtle text-foreground",
  counter: "bg-surface-subtle text-muted-foreground",
};

function parseNodes(resultData: Record<string, unknown>): ThesisNode[] {
  const items = Array.isArray(resultData.nodes) ? resultData.nodes : [];
  return items
    .map((raw): ThesisNode | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const column = o.column;
      if (
        column !== "core" &&
        column !== "support" &&
        column !== "evidence" &&
        column !== "counter"
      ) {
        return null;
      }
      const title = typeof o.title === "string" ? o.title : "";
      const summary = typeof o.summary === "string" ? o.summary : "";
      if (!title && !summary) return null;
      return { column, title, summary };
    })
    .filter((n): n is ThesisNode => n !== null);
}

function renderNode(node: ThesisNode, index: number) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${COLUMN_TONE[node.column]}`}
        >
          {COLUMN_LABEL[node.column]}
        </span>
        {node.title ? (
          <span className="flex-1 font-medium leading-snug text-foreground">
            {node.title}
          </span>
        ) : null}
      </div>
      {node.summary ? (
        <span className="text-xs text-muted-foreground">{node.summary}</span>
      ) : null}
      <span className="sr-only">{index + 1}</span>
    </div>
  );
}

export function PlanningThesisIsland({
  projectId,
  artifactId,
  topic,
}: {
  projectId: string;
  artifactId: string;
  topic: string;
}) {
  return (
    <AdoptCandidateCard<ThesisNode>
      title="AI 论点树"
      description="按你的定位 + 选题,生成核心论点 + 支撑/证据/反驳分支"
      startLabel="帮我搭论点树"
      runningLabel="策划 agent 正在构建论点树（可能要一两分钟）…"
      taskType="planning.thesis"
      inputData={{ projectId, artifactId, topic }}
      parseItems={parseNodes}
      renderItem={renderNode}
      adoptLabel={(n) => `采纳为新版本（${n} 个论点）`}
      doneLabel={() => "已采纳为论点树新版本。"}
    />
  );
}
