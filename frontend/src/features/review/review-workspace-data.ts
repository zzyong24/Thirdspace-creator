import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import type { AnalyticsViewModel } from "@/types/view-models";
import {
  buildAnalyticsReviewViewModelFromOp,
  type MetricSnapshotDto,
} from "./analytics-review-view-model";

/**
 * Analytics & Review Workspace READ-side data assembly ("工作台读侧做真").
 *
 * Assembles a REAL `AnalyticsViewModel` for the Review stage. Only ONE region of
 * this page has an owned read op this wave — the AI 洞察/经验 card (rendered from
 * `viewModel.aiAnalysis`). Everything else (core metrics, the views/conversion/
 * audience/retention charts, key moments, review history) has NO owned read op,
 * so it stays the deterministic fixture/mock shape — we do NOT fake those as
 * "real". The honest split:
 *
 *   REAL  → `aiAnalysis` overlaid from `learnings.list` (the AI-distilled
 *           experience persisted by the 复盘 pipeline). These are user-scoped
 *           learnings, surfaced as the project's insight card.
 *   MOCK  → metrics / viewsTrend / conversionFunnel / audience* / retentionCurve
 *           / keyMoments / topPublished / reviewHistory — kept from the fixture
 *           builder (canonical demo projects) or EMPTY for real / non-fixture
 *           projects, so the cards render their empty state instead of fake data.
 *
 * Degrades gracefully:
 *   - The metrics/chart base is built via `buildAnalyticsReviewViewModelFromOp`
 *     over the real `analytics.projects.get` payload (preserving the route's
 *     prior behavior). A failure there falls back to the deterministic fixture
 *     selector — a real project NEVER renders "未找到项目".
 *   - The learnings read is independent: if it throws, `aiAnalysis` keeps its
 *     fixture/empty value. A real learning set OVERWRITES the fixture insights.
 *
 * The contract client is injected so this helper is unit-testable without the
 * real in-process backend.
 */

// Minimal structural DTO — the contract client returns a parsed
// `learningResource[]`; we only read the fields we map.
interface LearningDto {
  readonly id: string;
  readonly title: string;
  readonly insight: string;
  readonly recommendation: string;
  readonly validationStatus: "candidate" | "validated" | "discarded";
  readonly confidenceScore: number;
  readonly createdAt: string;
}

export interface ReviewDataClient {
  getProjectAnalytics(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listLearnings(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

/** Maps a persisted learning to an `aiAnalysis` insight card item. */
function learningToInsight(
  learning: LearningDto,
): AnalyticsViewModel["aiAnalysis"][number] {
  const body = learning.recommendation
    ? `${learning.insight}\n建议：${learning.recommendation}`
    : learning.insight;
  return {
    id: `learning-${learning.id}`,
    title: learning.title,
    body,
  };
}

/**
 * Build the REAL Review ViewModel, degrading to the fixture VM on failure.
 *
 * @param projectId  the (already canonical-resolved) route project id.
 * @param client     the contract client (server-bound). Injected for tests.
 */
export async function buildReviewWorkspaceViewModel(
  projectId: string,
  client: ReviewDataClient = defaultClient as unknown as ReviewDataClient,
): Promise<AnalyticsViewModel> {
  // --- Metrics / charts base (mock, honest) -------------------------------
  // Preserve the route's prior behavior: build over the real analytics op, fall
  // back to the deterministic fixture selector on failure so the page never
  // crashes / never shows "未找到项目" for a real project.
  let base: AnalyticsViewModel;
  try {
    const snapshots = (await client.getProjectAnalytics({
      params: { projectId },
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<MetricSnapshotDto>;
    base = buildAnalyticsReviewViewModelFromOp(projectId, snapshots);
  } catch {
    base = buildAnalyticsReviewViewModel(projectId);
  }

  // A canonical/demo project keeps the fixture's curated insight content as the
  // fallback; a real project shows an empty insight card (no fake data) when it
  // has no learnings.
  const isFixtureProject = base.scenario !== "empty";

  // --- AI 洞察 / 经验 region (REAL via learnings.list) ---------------------
  let aiAnalysis: AnalyticsViewModel["aiAnalysis"] = isFixtureProject
    ? base.aiAnalysis
    : [];
  try {
    const learnings = (await client.listLearnings({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<LearningDto>;

    // Surface the AI-distilled experience: drop discarded learnings, prefer the
    // higher-confidence validated ones first.
    const surfaced = learnings
      .filter((learning) => learning.validationStatus !== "discarded")
      .sort((a, b) => {
        const aValidated = a.validationStatus === "validated" ? 1 : 0;
        const bValidated = b.validationStatus === "validated" ? 1 : 0;
        if (aValidated !== bValidated) return bValidated - aValidated;
        return b.confidenceScore - a.confidenceScore;
      });

    if (surfaced.length > 0) {
      // Real learnings OVERWRITE the fixture insight content.
      aiAnalysis = surfaced.map(learningToInsight);
    }
    // No learnings → keep the fixture value (demo) / empty (real project).
  } catch {
    // Learnings read failed — keep the fixture/empty value already assigned.
  }

  return {
    ...base,
    aiAnalysis,
  };
}
