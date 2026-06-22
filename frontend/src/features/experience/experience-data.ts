import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildExperienceViewModel } from "@/fixtures/selectors";
import type {
  ExperienceRecord,
  ExperienceViewModel,
  DiscoveryRow,
  SummaryCardVm,
} from "./experience-page";

/**
 * Experience Center READ-side data assembly ("经验沉淀 读侧做真").
 *
 * Fulfils the TODO left in `experience/page.tsx` — "the records-source migration
 * to `learnings.list`" — by assembling a REAL `ExperienceViewModel` for the route
 * from `learnings.list`:
 *
 *   - 记录表 (records)          → one ExperienceRecord per real Learning, carrying
 *                                 the REAL `learningId` + `validationStatus` so the
 *                                 应用经验 / 验证 / 废弃 controls hit the real Learning
 *                                 (never a fixture id).
 *   - 最近发现 (discoveries)    → the most recent (non-discarded) learnings, each
 *                                 mapped to its title / insight / type.
 *   - AI 洞察总结 4 张摘要卡     → 总数 / 已验证 / 复用率(从 confidence) / 待改进,
 *                                 counted from the REAL learnings when present;
 *                                 the per-card delta/trend has no real source so it
 *                                 falls back to the fixture card's.
 *
 * Degrades gracefully: if `learnings.list` throws, the WHOLE VM falls back to the
 * fixture builder (preserving the old fixture render). When the read SUCCEEDS but
 * returns zero learnings, the records / discoveries render an honest empty state
 * (the islands own it) rather than fixture rows tied to fixture ids.
 *
 * The non-learning-backed regions (右栏 valueOverview / applicationEffect /
 * popularExperiences / quickActions, tabs, categories) have no real source this
 * wave and keep the fixture content.
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend.
 */

// learningType → display category label (matches the page's tab labels /
// CATEGORY_TO_TAB map in experience-interactive-region.tsx). The Learning's
// `learningType` enum is the real source; an unknown type falls through to 复盘沉淀.
const LEARNING_TYPE_TO_CATEGORY: Record<string, string> = {
  strategy: "选题策划",
  hook: "脚本结构",
  structure: "脚本结构",
  process: "拍摄执行",
  failure: "复盘沉淀",
  conversion_pattern: "互动运营",
  offer_insight: "互动运营",
};

function categoryForLearning(learning: LearningDto): string {
  return LEARNING_TYPE_TO_CATEGORY[learning.learningType] ?? "复盘沉淀";
}

// Minimal structural DTO — the contract client returns a parsed
// `learningResource[]`; we only read the fields we map.
interface LearningDto {
  readonly id: string;
  readonly title: string;
  readonly insight: string;
  readonly recommendation: string;
  readonly learningType: string;
  readonly validationStatus: "candidate" | "validated" | "discarded";
  readonly confidenceScore: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExperienceDataClient {
  listLearnings(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

/** Map a learning to a records-table row, carrying its REAL id + status. */
function learningToRecord(learning: LearningDto): ExperienceRecord {
  return {
    id: `learning-${learning.id}`,
    title: learning.title,
    category: categoryForLearning(learning),
    updatedAt: (learning.updatedAt ?? learning.createdAt ?? "").slice(0, 10),
    // No real reuse-count source on the Learning resource this wave — keep it
    // honest at 0 rather than inventing a number.
    reuseCount: 0,
    learningId: learning.id,
    validationStatus: learning.validationStatus,
  };
}

/** Map a learning to a 最近发现 row. */
function learningToDiscovery(learning: LearningDto): DiscoveryRow {
  return {
    id: `disc-${learning.id}`,
    title: learning.title,
    // The insight is the body of the discovery; surfaced as the source line.
    source: learning.insight || "经验库",
    type: categoryForLearning(learning),
    // No real effect-metric on the Learning resource — surface the real
    // confidence score instead of a fabricated lift number.
    effectLabel: `置信度 ${learning.confidenceScore}`,
  };
}

/**
 * Build the 4 summary cards from real learning counts, preserving the fixture
 * card's id/label/delta/trend/tone (no real delta source this wave).
 */
function buildSummaryCards(
  learnings: ReadonlyArray<LearningDto>,
  fixtureCards: ReadonlyArray<SummaryCardVm>,
): ReadonlyArray<SummaryCardVm> {
  const total = learnings.length;
  const verified = learnings.filter(
    (l) => l.validationStatus === "validated",
  ).length;
  const candidates = learnings.filter(
    (l) => l.validationStatus === "candidate",
  ).length;
  // "复用率" has no real reuse source — surface the validated ratio (validated /
  // total) as the closest real signal so the card is a count of real data.
  const reuseRate = total > 0 ? Math.round((verified / total) * 100) : 0;

  // Patch each fixture card's `value` from real counts by id; keep everything
  // else (label / delta / trend / tone) from the fixture so the card stays
  // visually identical and the non-real delta is honestly fixture-sourced.
  return fixtureCards.map((card) => {
    switch (card.id) {
      case "exp-m-total":
        return { ...card, value: String(total) };
      case "exp-m-verified":
        return { ...card, value: String(verified) };
      case "exp-m-reuse":
        return { ...card, value: `${reuseRate}%` };
      case "exp-m-improvement":
        // 待改进 = candidate (not-yet-validated) learnings.
        return { ...card, value: String(candidates) };
      default:
        return card;
    }
  });
}

/**
 * Build the REAL Experience ViewModel, degrading to the fixture VM on failure.
 *
 * @param client  the contract client (server-bound). Injected for tests.
 */
export async function buildExperienceWorkspaceViewModel(
  client: ExperienceDataClient = defaultClient as unknown as ExperienceDataClient,
): Promise<ExperienceViewModel> {
  const fixtureVm = buildExperienceViewModel();

  let learnings: ReadonlyArray<LearningDto>;
  try {
    learnings = (await client.listLearnings({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<LearningDto>;
  } catch {
    // Read failed → preserve the old fixture render entirely.
    return fixtureVm;
  }

  // The records table maps EVERY real learning (incl. discarded — the table is
  // the management surface where 验证/废弃 happen). Empty if there are no
  // learnings — the records island owns the empty state.
  const records = learnings.map(learningToRecord);

  // 最近发现: surface the most-recently-updated non-discarded learnings (top 4),
  // matching the fixture's 4-row shape. Empty when there are none.
  const discoveries = [...learnings]
    .filter((l) => l.validationStatus !== "discarded")
    .sort((a, b) =>
      (b.updatedAt ?? b.createdAt ?? "").localeCompare(
        a.updatedAt ?? a.createdAt ?? "",
      ),
    )
    .slice(0, 4)
    .map(learningToDiscovery);

  return {
    // tabs / categories / right-rail have no real source this wave — fixture.
    tabs: fixtureVm.tabs,
    // 4 summary cards: counted from real learnings, fixture delta/trend/tone.
    summaryCards: buildSummaryCards(learnings, fixtureVm.summaryCards),
    // 最近发现: real learnings (top 4) or honest-empty.
    discoveries,
    categories: fixtureVm.categories,
    // 记录表: every real learning, with the REAL learningId + status.
    records,
    valueOverview: fixtureVm.valueOverview,
    applicationEffect: fixtureVm.applicationEffect,
    popularExperiences: fixtureVm.popularExperiences,
    quickActions: fixtureVm.quickActions,
  };
}
