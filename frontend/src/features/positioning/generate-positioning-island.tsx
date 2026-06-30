"use client";

/**
 * `GeneratePositioningIsland` — 定位中心 AI 赋能带的唯一真按钮「✨ AI 生成定位建议」,
 * a thin wrapper over the reusable `AdoptCandidateCard` (机制③), mirroring
 * `gather-material-island.tsx`. It supplies only this node's specifics:
 *
 *  - taskType `positioning.generate` (Phase A runner — reads the creator's
 *    CreativeContext + 抖音上下文 → real LLM → structured 定位建议).
 *  - inputData `{}` (the runner derives everything from the user's RequestContext;
 *    no per-call params yet).
 *  - parseSuggestion: resultData `{ suggestion: {...} }` → ONE candidate card.
 *  - 采纳 → client.confirmTask → server upserts the 5-facet profile + appends a NEW
 *    statement version tagged createdByType:"ai" (ai.service positioning_profile
 *    branch), then router.refresh() re-reads pages.positioning.get.
 *
 * The whole create→poll→confirm loop lives in AdoptCandidateCard; this island only
 * names the node and renders one suggestion card. No new contract op.
 */

import * as React from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";

/** Mirrors the runner's `PositioningSuggestion` (positioning-runner.ts). */
interface PositioningSuggestion {
  persona: string;
  field: string;
  audience: string;
  differentiation: string;
  capabilities: string[];
  oneLiner: string;
  keywords: string[];
}

/**
 * resultData carries `{ suggestion: {...} }` (one proposal per task). We surface it
 * as a single-element array so AdoptCandidateCard's list renderer shows ONE card.
 */
function parseSuggestion(
  resultData: Record<string, unknown>,
): PositioningSuggestion[] {
  const s = (resultData.suggestion ?? null) as Record<string, unknown> | null;
  if (!s) return [];
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const suggestion: PositioningSuggestion = {
    persona: str(s.persona),
    field: str(s.field),
    audience: str(s.audience),
    differentiation: str(s.differentiation),
    capabilities: strArr(s.capabilities),
    oneLiner: str(s.oneLiner),
    keywords: strArr(s.keywords),
  };
  // A wholly-empty payload is not worth a card (parse fallback in the runner).
  if (!suggestion.oneLiner && !suggestion.persona) return [];
  return [suggestion];
}

function renderSuggestion(s: PositioningSuggestion) {
  const facets: ReadonlyArray<readonly [string, string]> = [
    ["人设", s.persona],
    ["领域", s.field],
    ["目标人群", s.audience],
    ["差异化", s.differentiation],
    ["能力清单", s.capabilities.join("、")],
  ];
  return (
    <div className="flex flex-col gap-2 rounded-control border border-border bg-surface px-3 py-2.5 text-sm">
      {s.oneLiner ? (
        <p className="font-medium leading-snug text-foreground">
          {s.oneLiner}
        </p>
      ) : null}
      <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {facets
          .filter(([, v]) => v.length > 0)
          .map(([label, value]) => (
            <div key={label} className="flex gap-1.5 text-xs">
              <dt className="shrink-0 text-text-subtle">{label}</dt>
              <dd className="text-muted-foreground">{value}</dd>
            </div>
          ))}
      </dl>
      {s.keywords.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {s.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-4xl bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
            >
              {kw}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function GeneratePositioningIsland() {
  return (
    <div className="flex flex-col gap-2">
      <AdoptCandidateCard<PositioningSuggestion>
        title="AI 帮你定位"
        description="让 agent 读你的账号上下文与历史内容,生成一套结构化定位建议。采纳后写入当前定位母版,并追加一条 AI 版本。"
        startLabel="AI 生成定位建议"
        runningLabel="agent 正在分析你的账号与内容,生成定位建议（可能要一两分钟）…"
        taskType="positioning.generate"
        inputData={{}}
        parseItems={parseSuggestion}
        renderItem={renderSuggestion}
        adoptLabel={() => "采纳为当前定位"}
        doneLabel={() => "已采纳为当前定位,并追加了一条 AI 版本。"}
      />
      {/* 一键岛预调(SPEC §3.4):打开 ChatBox 进定位编导,预调 positioning.generate(边聊边打磨)。 */}
      <Link
        href={copilotDeepLink("positioning", "positioning.generate")}
        data-testid="positioning-open-copilot"
        className="inline-flex h-8 w-fit items-center gap-1.5 rounded-control border border-brand/30 bg-surface px-3 text-xs font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft/60"
      >
        <MessagesSquare className="size-4" />
        在对话里聊定位
      </Link>
    </div>
  );
}
