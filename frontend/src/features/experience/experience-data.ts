import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildExperienceViewModel } from "@/fixtures/selectors";
import type {
  ExperienceRecord,
  ExperienceViewModel,
  ExperienceCategory,
  DiscoveryRow,
  PopularExperience,
  SummaryCardVm,
  ValueOverviewVm,
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
//
// `editing → 后期剪辑` maps the post-production learningType (GAP-EXP-edit): the
// contract `learningType` enum now emits `editing`, so real learnings tagged
// `editing` bucket into the 后期剪辑 (`edit`) tab instead of falling through to 复盘沉淀.
const LEARNING_TYPE_TO_CATEGORY: Record<string, string> = {
  strategy: "选题策划",
  hook: "脚本结构",
  structure: "脚本结构",
  process: "拍摄执行",
  editing: "后期剪辑", // post-production bucket (GAP-EXP-edit)
  failure: "复盘沉淀",
  conversion_pattern: "互动运营",
  offer_insight: "互动运营",
};

// Display category label → the interactive region's filter tab id. Kept in sync
// with CATEGORY_TO_TAB in experience-interactive-region.tsx so the records the
// server buckets line up with the client-side tab filter (D1 = client-side
// bucketing of one full `learnings.list` read; switching a tab issues NO request).
const CATEGORY_TO_TAB: Record<string, string> = {
  选题策划: "topic",
  脚本结构: "script",
  拍摄执行: "shoot",
  后期剪辑: "edit",
  互动运营: "engage",
  复盘沉淀: "review",
};

function categoryForLearning(learning: LearningDto): string {
  return LEARNING_TYPE_TO_CATEGORY[learning.learningType] ?? "复盘沉淀";
}

function tabIdForLearning(learning: LearningDto): string {
  return CATEGORY_TO_TAB[categoryForLearning(learning)] ?? "review";
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
  // Real reuse signal — number of LearningApplications referencing this learning
  // (server-derived from the learningApplications table). May be absent on an
  // older payload, defaulted to 0 at the read site.
  readonly reuseCount?: number;
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
    // Real reuse count — number of LearningApplications referencing this learning,
    // server-derived on `learnings.list`. Falls back to 0 only if the field is
    // absent (older payload / honest zero for a never-applied learning).
    reuseCount: learning.reuseCount ?? 0,
    learningId: learning.id,
    validationStatus: learning.validationStatus,
    // Stamp the real, learningType-derived filter tab so the client-side七步 tab
    // filter buckets each row by its REAL stage (not by re-deriving the display
    // label). The 后期剪辑 (`edit`) tab now buckets learnings tagged with the
    // `editing` learningType (GAP-EXP-edit); it stays empty only when no such
    // learning exists — honest empty rather than a borrowed bucket.
    tabId: tabIdForLearning(learning),
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
  // "复用率" — now a REAL signal: the share of learnings that have been reused at
  // least once (reuseCount > 0), derived from the server-aggregated reuseCount on
  // each learning. 0% when nothing has been applied yet (honest empty).
  const reused = learnings.filter((l) => (l.reuseCount ?? 0) > 0).length;
  const reuseRate = total > 0 ? Math.round((reused / total) * 100) : 0;

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
 * Build the 6 经验库分类 cards from real per-category learning counts, preserving
 * each fixture card's id/name/tone. Note the 6th fixture card is 失败案例 (mapped
 * from `failure` learnings) whereas the records bucket calls that label 复盘沉淀 —
 * we count 复盘沉淀-category learnings into the 失败案例 card so the count stays real.
 */
function buildCategories(
  learnings: ReadonlyArray<LearningDto>,
  fixtureCategories: ReadonlyArray<ExperienceCategory>,
): ReadonlyArray<ExperienceCategory> {
  const counts = new Map<string, number>();
  for (const learning of learnings) {
    const cat = categoryForLearning(learning);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  // fixture card id → the display-category label whose real count it shows.
  const CARD_TO_CATEGORY: Record<string, string> = {
    "experience-topic": "选题策划",
    "experience-script": "脚本结构",
    "experience-shoot": "拍摄执行",
    "experience-edit": "后期剪辑",
    "experience-engage": "互动运营",
    "experience-failures": "复盘沉淀",
  };
  return fixtureCategories.map((card) => {
    const category = CARD_TO_CATEGORY[card.id];
    if (category === undefined) return card;
    return { ...card, count: counts.get(category) ?? 0 };
  });
}

/**
 * Build the 价值概览 from real counts (acceptance #2): total / verified / reuse
 * rate / 待改进, mirroring the summary-card derivation so the rail and the cards
 * agree. No real delta source — labels are literal counts.
 */
function buildValueOverview(
  learnings: ReadonlyArray<LearningDto>,
): ValueOverviewVm {
  const total = learnings.length;
  const verified = learnings.filter(
    (l) => l.validationStatus === "validated",
  ).length;
  const candidates = learnings.filter(
    (l) => l.validationStatus === "candidate",
  ).length;
  const reused = learnings.filter((l) => (l.reuseCount ?? 0) > 0).length;
  const reuseRate = total > 0 ? Math.round((reused / total) * 100) : 0;
  return {
    totalLabel: `总经验沉淀 ${total}`,
    verifiedLabel: `已验证 ${verified}`,
    reuseRate,
    improvementLabel: `待改进 ${candidates}`,
  };
}

/**
 * Build 热门经验 from REAL learnings ordered by `reuseCount` desc (acceptance #3):
 * only learnings actually reused (reuseCount > 0) appear, top 3 to match the
 * fixture's shape. Empty when nothing has been reused — the rail owns the honest
 * "暂无热门经验" empty state.
 */
function buildPopularExperiences(
  learnings: ReadonlyArray<LearningDto>,
): ReadonlyArray<PopularExperience> {
  return [...learnings]
    .filter((l) => (l.reuseCount ?? 0) > 0)
    .sort((a, b) => (b.reuseCount ?? 0) - (a.reuseCount ?? 0))
    .slice(0, 3)
    .map((l) => ({
      id: `pop-${l.id}`,
      title: l.title,
      category: categoryForLearning(l),
      usage: `被引用 ${l.reuseCount ?? 0} 次`,
    }));
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
    // tabs: structural (the 七步 filter labels) — fixture-sourced.
    tabs: fixtureVm.tabs,
    // 4 summary cards: counted from real learnings, fixture delta/trend/tone.
    summaryCards: buildSummaryCards(learnings, fixtureVm.summaryCards),
    // 最近发现: real learnings (top 4) or honest-empty.
    discoveries,
    // 经验库分类: per-category counts from the SAME real buckets the七步 tab filters.
    categories: buildCategories(learnings, fixtureVm.categories),
    // 记录表: every real learning, with the REAL learningId + status + tabId.
    records,
    // 价值概览: real total / verified / reuse / 待改进 counts.
    valueOverview: buildValueOverview(learnings),
    // 应用效果: no real day-series source — keep the fixture trend (the chart frame
    // labels it 近 5 月 引用近似). followUp: derive from a real time-bucketed reuse
    // series once learnings.applications carries a created-at series read.
    applicationEffect: fixtureVm.applicationEffect,
    // 热门经验: real learnings by reuseCount desc, or honest-empty.
    popularExperiences: buildPopularExperiences(learnings),
    quickActions: fixtureVm.quickActions,
  };
}
