import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { buildAnalyticsReviewViewModel } from "@/fixtures/selectors";
import type {
  AnalyticsViewModel,
  RevenueProductRow,
  RevenueTab,
} from "@/types/view-models";
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
 *   REAL  → `comparison` (REV-2 对比分析) derived in the pure view-model builder
 *           by grouping the SAME `analytics.projects.get` snapshots by
 *           publicationId (zero new backend op). Honest empty <2 publications.
 *   REAL  → `revenue` (REV-1 收益分析) assembled here from the monetization
 *           contract: `monetization.funnel.get` (project-level funnel + honest
 *           unattributed ratio) + this project's outputs → linked products
 *           (`projects.outputs.list` → `outputs.products.list` → `products.get`).
 *           Omitted entirely when there is no real data → honest empty state.
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

// --- REV-1 收益分析 structural DTOs (monetization contract) -----------------
// Subset of `monetizationFunnelResource` (monetization.funnel.get).
interface FunnelStageDto {
  readonly stage: string;
  readonly count: number;
}
interface MonetizationFunnelDto {
  readonly stages: ReadonlyArray<FunnelStageDto>;
  readonly revenueAttributed: number;
  readonly unattributed: {
    readonly leadCount: number;
    readonly conversionCount: number;
    readonly revenue: number;
  };
  readonly unattributedRatio: number;
}
// Subset of `contentOutputResource` (projects.outputs.list).
interface OutputDto {
  readonly id: string;
  readonly title: string;
}
// Subset of `contentOutputProductResource` (outputs.products.list).
interface OutputProductDto {
  readonly id: string;
  readonly productId: string;
  readonly contentRole: string | null;
}
// Subset of `productResource` (products.get).
interface ProductDto {
  readonly id: string;
  readonly name: string;
  readonly tier: string | null;
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
  // REV-1 收益分析 — monetization funnel + this project's output→product links.
  // Method names mirror the contract op map keys (createClient indexes by key).
  getFunnel(input: {
    params: undefined;
    query: {
      productId?: string;
      periodStart?: string;
      periodEnd?: string;
    };
    body: undefined;
  }): Promise<unknown>;
  listOutputs(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listOutputProducts(input: {
    params: { outputId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  getProduct(input: {
    params: { productId: string };
    query: undefined;
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

// Maps a funnel `stage` (the `conversionEventType` enum) to a human 漏斗 label.
// Mirrors contract primitives: profile_visit/follow/lead/inquiry/signup/
// purchase/repurchase. The funnel narrows 曝光→线索→成交; unknown stages pass
// through their raw key (honest, never silently dropped).
const FUNNEL_STAGE_LABEL: Readonly<Record<string, string>> = {
  profile_visit: "主页访问",
  follow: "关注",
  lead: "线索",
  inquiry: "咨询",
  signup: "报名",
  purchase: "成交",
  repurchase: "复购",
};

/**
 * REV-1 收益分析 — pure builder shaping the monetization funnel + linked products
 * into the `revenue` tab. Always carries the funnel (incl. 金额) and the honest
 * unattributed ratio (§4.5). Returns `null` for the empty state: no funnel
 * activity (every stage 0 AND no revenue) AND no products → the page renders
 * "尚无变现数据" instead of a fake all-zero table.
 */
export function buildRevenueTab(
  funnel: MonetizationFunnelDto | null,
  products: ReadonlyArray<RevenueProductRow>,
): RevenueTab | null {
  const stages = funnel?.stages ?? [];
  const funnelRows = stages.map((s) => ({
    label: FUNNEL_STAGE_LABEL[s.stage] ?? s.stage,
    value: s.count,
  }));
  // Append the 金额 stage (attributed revenue) as the funnel tail.
  const revenueAttributed = funnel?.revenueAttributed ?? 0;
  if (funnel) {
    funnelRows.push({ label: "金额", value: revenueAttributed });
  }

  const hasFunnelActivity =
    stages.some((s) => s.count > 0) || revenueAttributed > 0;
  // Honest empty state: nothing to show.
  if (!hasFunnelActivity && products.length === 0) return null;

  return {
    funnel: funnelRows,
    revenueAttributed,
    unattributedRatio: funnel?.unattributedRatio ?? 0,
    products,
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

  // --- REV-1 收益分析 region (REAL via monetization contract) --------------
  // Project-level funnel (one getFunnel hop, §REV-1 default口径) + the products
  // this project's outputs are linked to. Fully degrades: any read failure ⇒
  // `revenue` stays undefined ⇒ the tab renders its empty state, never crashes.
  let revenue: RevenueTab | null = null;
  try {
    let funnel: MonetizationFunnelDto | null = null;
    try {
      funnel = (await client.getFunnel({
        params: undefined,
        query: {},
        body: undefined,
      })) as MonetizationFunnelDto;
    } catch {
      funnel = null;
    }

    // Resolve this project's outputs → their linked products (name + tier +
    // contentRole). Each sub-read is isolated so one bad output never sinks the
    // whole tab.
    const productRows: RevenueProductRow[] = [];
    try {
      const outputs = (await client.listOutputs({
        params: { projectId },
        query: { page: 1, pageSize: 100 },
        body: undefined,
      })) as ReadonlyArray<OutputDto>;

      const seen = new Set<string>();
      for (const output of outputs) {
        let links: ReadonlyArray<OutputProductDto> = [];
        try {
          links = (await client.listOutputProducts({
            params: { outputId: output.id },
            query: { page: 1, pageSize: 100 },
            body: undefined,
          })) as ReadonlyArray<OutputProductDto>;
        } catch {
          continue;
        }
        for (const link of links) {
          // De-dupe a product linked to multiple outputs of the same project.
          if (seen.has(link.productId)) continue;
          seen.add(link.productId);
          let product: ProductDto | null = null;
          try {
            product = (await client.getProduct({
              params: { productId: link.productId },
              query: undefined,
              body: undefined,
            })) as ProductDto;
          } catch {
            product = null;
          }
          productRows.push({
            id: link.productId,
            name: product?.name ?? "未命名产品",
            tier: product?.tier ?? "—",
            contentRole: link.contentRole ?? "—",
          });
        }
      }
    } catch {
      // Output/product read failed — keep whatever products we gathered.
    }

    revenue = buildRevenueTab(funnel, productRows);
  } catch {
    // Any unexpected failure — leave revenue null (empty state).
    revenue = null;
  }

  return {
    ...base,
    aiAnalysis,
    // REV-1: omit the field entirely when there is no real revenue data so the
    // page renders the honest empty state (optional, additive field).
    ...(revenue ? { revenue } : {}),
  };
}
