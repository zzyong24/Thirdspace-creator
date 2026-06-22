"use client";

/**
 * `MaterialMatchIsland` — the 素材匹配 node (material.match, 制作 stage), a thin wrapper over
 * the shared `AdoptCandidateCard`. AI scans the creator's asset library and proposes which
 * real assets to use for this content (with a role + reason); 采纳 → each match becomes a
 * material-link (entityType "asset", stage "production"), making the 素材库⇄制作 edge real.
 */

import * as React from "react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";

interface MaterialMatch {
  assetId: string;
  role: string;
  reason: string;
}

const ROLE_LABEL: Record<string, string> = {
  broll: "空镜",
  clip: "片段",
  cover: "封面",
  空镜: "空镜",
  片段: "片段",
  封面: "封面",
};

function parseMatches(resultData: Record<string, unknown>): MaterialMatch[] {
  const matches = Array.isArray(resultData.matches) ? resultData.matches : [];
  return matches
    .map((raw): MaterialMatch | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const assetId = typeof o.assetId === "string" ? o.assetId : "";
      if (!assetId) return null;
      return {
        assetId,
        role: typeof o.role === "string" ? o.role : "",
        reason: typeof o.reason === "string" ? o.reason : "",
      };
    })
    .filter((m): m is MaterialMatch => m !== null);
}

function renderMatch(m: MaterialMatch) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate font-mono text-xs font-medium leading-snug text-foreground">
          {m.assetId}
        </span>
        {ROLE_LABEL[m.role] ? (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {ROLE_LABEL[m.role]}
          </span>
        ) : null}
      </div>
      {m.reason ? (
        <span className="text-[11px] text-text-subtle">{m.reason}</span>
      ) : null}
    </div>
  );
}

export interface MaterialMatchIslandProps {
  readonly projectId: string;
  readonly outputId: string;
  readonly topic?: string;
}

export function MaterialMatchIsland({
  projectId,
  outputId,
  topic,
}: MaterialMatchIslandProps) {
  const inputData = React.useMemo(
    () => ({ projectId, outputId, topic: topic ?? "" }),
    [projectId, outputId, topic],
  );
  return (
    <AdoptCandidateCard<MaterialMatch>
      title="AI 素材匹配"
      description="扫描你的素材库,挑出适合这条内容的素材"
      startLabel="帮我配素材"
      runningLabel="素材匹配 agent 正在按内容主题筛选素材库（可能要一两分钟）…"
      taskType="material.match"
      inputData={inputData}
      parseItems={parseMatches}
      renderItem={renderMatch}
      adoptLabel={(n) => `采纳全部（${n}）入用料链`}
      doneLabel={(n) => `已采纳 ${n} 条进用料链（制作阶段）。`}
    />
  );
}
