/**
 * 选题候选池 page (七步③ · SPEC §5.5) — the 选题情报 surface answering spec §9.2
 * 「我有多少条按变现潜力排序的待选选题？最近用户在评论里反复问什么？」.
 *
 * Server-component shell with a `viewModel?` test seam (mirrors monetization/
 * positioning/knowledge). The default render reads `candidates.list` (sorted) +
 * `audienceSignals.list` (real SQL via the composite transport — C-2: contract op →
 * dispatch → Drizzle/pglite, NOT fixtures-only). The card pool is sorted by the
 * monetization-weighted signal (predictedScore default; positioningFit / demandCount
 * switchable). The mutating controls (新增候选 / 晋升为 Project / 候选状态 drop / 排序 /
 * 一键转 Candidate) live in the client island `topics-interactive-region.tsx`, calling
 * the mapped contract op then `router.refresh()`.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors.
 * `/topics` is a brand-new page — per spec C-5 (R2-9) the visual baseline is NOT
 * re-based here; this page is 暂不纳入视觉门禁 until the stage-12 re-baseline.
 *
 * Roadmap note: the Knowledge page's decorative 「热门选题」row is SUPERSEDED by this
 * page for AI-sourced trend candidates — that row stays inert (no double-wire).
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  CandidateResource,
  AudienceSignalResource,
} from "@/server/modules/candidate";

/**
 * Structural seam for the server reads. The route passes a session-scoped
 * `createServerClient(ctx)` so candidates / audience signals stay user-scoped;
 * the default keeps the singleton (canonical ctx) as the SSR/test fallback seam.
 */
export type TopicsReadClient = Pick<
  typeof defaultClient,
  "listCandidates" | "listAudienceSignals"
>;

import {
  CreateCandidateForm,
  CandidateCard,
  CandidateSortControl,
  type CandidateSortKey,
} from "./topics-interactive-region";
import { AudienceQuestionsCard } from "./audience-questions-card";
import { TopicGenerateIsland } from "./topic-generate-island";

export interface TopicsViewModel {
  readonly candidates: CandidateResource[];
  readonly signals: AudienceSignalResource[];
  readonly sort: CandidateSortKey;
}

export interface TopicsPageProps {
  /** Override hook for tests; defaults to the server reads. */
  readonly viewModel?: TopicsViewModel;
  /** The active sort, read from the search params (defaults to predictedScore). */
  readonly sort?: CandidateSortKey;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`; defaults to the singleton seam.
   */
  readonly client?: TopicsReadClient;
}

const SORT_KEYS: readonly CandidateSortKey[] = [
  "predictedScore",
  "positioningFit",
  "demandCount",
];

function normalizeSort(sort: string | undefined): CandidateSortKey {
  return SORT_KEYS.includes(sort as CandidateSortKey)
    ? (sort as CandidateSortKey)
    : "predictedScore";
}

export async function TopicsPage({
  viewModel,
  sort,
  client = defaultClient,
}: TopicsPageProps) {
  const activeSort = normalizeSort(sort);
  const vm = viewModel ?? (await loadViewModel(activeSort, client));
  return <TopicsView viewModel={vm} />;
}

async function loadViewModel(
  sort: CandidateSortKey,
  client: TopicsReadClient,
): Promise<TopicsViewModel> {
  const candidates = (await client.listCandidates({
    params: undefined,
    query: { page: 1, pageSize: 100, sort },
    body: undefined,
  })) as unknown as CandidateResource[];
  const signals = (await client.listAudienceSignals({
    params: undefined,
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown as AudienceSignalResource[];
  return { candidates, signals, sort };
}

const SOURCE_LABELS: Record<string, string> = {
  trend: "趋势",
  benchmark: "对标",
  demand: "需求",
  idea: "灵感",
};

// Pure render — split out so tests can drive it synchronously with a fixed VM.
export function TopicsView({
  viewModel,
}: {
  readonly viewModel: TopicsViewModel;
}) {
  const { candidates, signals, sort } = viewModel;
  // pool candidates only on the board; dropped ones are filtered (still listed via
  // status, but the pool surface is the curation focus, §5.5).
  const pool = candidates.filter((c) => c.status !== "dropped");

  return (
    <div
      data-slot="topics"
      data-testid="topics"
      className="flex flex-col gap-section-gap"
    >
      <TopicGenerateIsland />

      <SectionCard title="选题候选池">
        <div className="flex flex-col gap-3 py-2">
          <div className="flex items-center justify-between">
            <CreateCandidateForm />
            <CandidateSortControl sort={sort} />
          </div>
          <ul
            data-testid="candidate-pool"
            data-sort={sort}
            className="flex flex-col gap-2"
          >
            {pool.length === 0 ? (
              <li
                data-testid="candidate-empty-state"
                className="text-sm text-muted-foreground"
              >
                还没有候选选题。手工新增一条，或等 AI/受众信号补充。
              </li>
            ) : (
              pool.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  sourceLabel={SOURCE_LABELS[c.source] ?? c.source}
                />
              ))
            )}
          </ul>
        </div>
      </SectionCard>

      {/* 评论区 & 客户问题 — 受众信号聚合，一键转 Candidate (§5.5). */}
      <AudienceQuestionsCard signals={signals} />

      {/* 已晋升/已丢弃的候选保留一个 inert 小结，方便复盘 (decorative). */}
      <SectionCard title="选题流转">
        <ul data-testid="candidate-status-summary" className="flex flex-wrap gap-2 py-2">
          {candidates.length === 0 ? (
            <li className="text-sm text-muted-foreground">暂无数据</li>
          ) : (
            <>
              <li>
                <Badge variant="secondary" className="text-[10px]">
                  候选池 {candidates.filter((c) => c.status === "pool").length}
                </Badge>
              </li>
              <li>
                <Badge variant="outline" className="text-[10px]">
                  已晋升 {candidates.filter((c) => c.status === "promoted").length}
                </Badge>
              </li>
              <li>
                <Badge variant="outline" className="text-[10px]">
                  已丢弃 {candidates.filter((c) => c.status === "dropped").length}
                </Badge>
              </li>
            </>
          )}
        </ul>
      </SectionCard>
    </div>
  );
}
