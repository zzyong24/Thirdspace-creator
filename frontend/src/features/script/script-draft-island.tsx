"use client";

/**
 * `ScriptDraftIsland` — the Script stage's 分镜脚本 node (script.draft), a thin wrapper over
 * the reusable `AdoptCandidateCard` (机制③). It supplies only this node's specifics: the
 * taskType, the inputData (projectId + artifactId + topic), and how to parse/render the
 * drafted shots. The createAITask→poll→采纳 loop lives in AdoptCandidateCard.
 *
 * On 采纳, the AI service's EXISTING artifact_version confirm branch appends a NEW
 * ArtifactVersion (createdByType:"ai") onto the project's 分镜脚本 artifact — the candidate
 * carried `artifactId` + `resultData.body`/`summary`, so no new confirm path is needed.
 */

import * as React from "react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";
import { ensureScriptArtifact } from "./ensure-script-artifact";

interface ScriptShot {
  口播: string;
  画面: string;
  字幕: string;
  时长: string;
}

function parseShots(resultData: Record<string, unknown>): ScriptShot[] {
  const items = Array.isArray(resultData.sections) ? resultData.sections : [];
  return items
    .map((raw): ScriptShot | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const 口播 = typeof o.口播 === "string" ? o.口播 : "";
      const 画面 = typeof o.画面 === "string" ? o.画面 : "";
      const 字幕 = typeof o.字幕 === "string" ? o.字幕 : "";
      const 时长 = typeof o.时长 === "string" ? o.时长 : "";
      if (!口播 && !画面 && !字幕) return null;
      return { 口播, 画面, 字幕, 时长 };
    })
    .filter((s): s is ScriptShot => s !== null);
}

function renderShot(shot: ScriptShot, index: number) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand tabular-nums">
          {index + 1}
        </span>
        {shot.时长 ? (
          <span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
            {shot.时长}
          </span>
        ) : null}
        {shot.口播 ? (
          <span className="flex-1 font-medium leading-snug text-foreground">
            {shot.口播}
          </span>
        ) : null}
      </div>
      {shot.画面 ? (
        <span className="text-xs text-muted-foreground">画面：{shot.画面}</span>
      ) : null}
      {shot.字幕 ? (
        <span className="text-[11px] text-text-subtle">字幕：{shot.字幕}</span>
      ) : null}
    </div>
  );
}

export function ScriptDraftIsland({
  projectId,
  artifactId,
  topic,
}: {
  projectId: string;
  // [T-053 断点①] null = 项目还没有脚本 artifact —— 岛照常渲染,点「帮我写分镜脚本」
  // 时经 prepareInput getOrCreate(ensureScriptArtifact),不再整岛消失。
  artifactId: string | null;
  topic: string;
}) {
  return (
    <AdoptCandidateCard<ScriptShot>
      title="AI 分镜脚本"
      description="按你的定位 + 过往爆款要素,生成钩子→痛点→价值→卡点→CTA 的分镜"
      startLabel="帮我写分镜脚本"
      runningLabel="分镜 agent 正在按爆款公式编排脚本（可能要一两分钟）…"
      taskType="script.draft"
      inputData={{ projectId, topic }}
      prepareInput={() => ensureScriptArtifact(projectId, artifactId)}
      parseItems={parseShots}
      renderItem={renderShot}
      adoptLabel={(n) => `采纳为新版本（${n} 镜）`}
      doneLabel={() => "已采纳为脚本新版本。"}
    />
  );
}
