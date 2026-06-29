/**
 * `calibration-data.ts` — server-side read aggregator for the 校准中心 workbench
 * (校准中心大改 · Slice 2, three-column rebuild).
 *
 * The 校准中心 route is a Server Component; it must NOT touch the repository (FE reads go
 * through the typed contract `client` → `/api/v1` dispatch → user-scoped pglite). This
 * helper composes the THREE real reads the workbench needs and shapes them into one
 * `CalibrationWorkbenchData` the page passes straight to the client island:
 *
 *  - `client.overview()`        → `calibration.overview` (GET /calibration/overview):
 *      { kpis, pendingSubjects, reflowRows, learnings } — the KPI band, 左待校准内容,
 *      底回流对照表, 经验沉淀. Every value is DERIVED server-side from real rows.
 *  - `client.listPredictions()` → `calibration.predictions.list`: the user's locked /
 *      draft predictions, each carrying the 维度评分约定 jsonb (predictedConversion.dimensions
 *      + predictedMetrics.{performance,diagnosis}) the 中栏评分表 + 右栏诊断 render.
 *  - `client.getRubric()`       → `calibration.rubrics.get`: the current 变现加权 RubricVersion
 *      (dimension labels + weights) for the 维度行 labels + the rubric selector.
 *
 * Subject titles: a Prediction carries only `subjectId` (the content_output id), not its
 * title. We resolve a title map from the overview's pendingSubjects (already titled) plus a
 * narrow `getOutput` lookup for any locked subject not in the pending list (locked subjects
 * are filtered OUT of 待校准内容). A title we cannot resolve falls back to the raw id — never
 * fabricated.
 *
 * Failure isolation: each read owns its own try/catch and degrades to an empty/null shape so
 * the page renders an honest empty state instead of crashing (the island's `useMutation`
 * seam only governs writes).
 */
import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  CalibrationOverviewResource,
  PredictionResource,
  RubricResource,
} from "@creatoros/backend/modules/calibration";

const CANONICAL_RUBRIC_ID = "rubric-canonical";

// The structural seam every read needs. The route passes a session-scoped
// `createServerClient(ctx)` so the workbench stays user-scoped; the default keeps the
// canonical singleton as the SSR/test fallback.
export type CalibrationReadClient = Pick<
  typeof defaultClient,
  "overview" | "listPredictions" | "getRubric" | "getOutput"
>;

export interface CalibrationWorkbenchData {
  readonly overview: CalibrationOverviewResource;
  readonly predictions: readonly PredictionResource[];
  readonly rubric: RubricResource | null;
  // subjectId → 内容标题 (resolved from pendingSubjects + getOutput; id when unknown).
  readonly subjectTitles: Readonly<Record<string, string>>;
}

const EMPTY_OVERVIEW: CalibrationOverviewResource = {
  kpis: {
    lockedPredictions: 0,
    completedReflows: 0,
    avgDeviationBand: "none",
    latestFinding: "",
  },
  pendingSubjects: [],
  reflowRows: [],
  learnings: [],
};

async function loadOverview(
  client: CalibrationReadClient,
): Promise<CalibrationOverviewResource> {
  try {
    return (await client.overview({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as unknown as CalibrationOverviewResource;
  } catch {
    return EMPTY_OVERVIEW;
  }
}

async function loadPredictions(
  client: CalibrationReadClient,
): Promise<PredictionResource[]> {
  try {
    return (await client.listPredictions({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as PredictionResource[];
  } catch {
    return [];
  }
}

async function loadRubric(
  client: CalibrationReadClient,
): Promise<RubricResource | null> {
  try {
    return (await client.getRubric({
      params: { rubricId: CANONICAL_RUBRIC_ID },
      query: undefined,
      body: undefined,
    })) as unknown as RubricResource;
  } catch {
    return null;
  }
}

// Build subjectId → title. pendingSubjects are pre-titled; for any prediction whose subject
// is NOT in that list (locked subjects are filtered out of 待校准内容) we resolve the title
// via a narrow getOutput lookup (content_output only). Unresolvable → the raw id (honest).
async function resolveSubjectTitles(
  client: CalibrationReadClient,
  overview: CalibrationOverviewResource,
  predictions: readonly PredictionResource[],
): Promise<Record<string, string>> {
  const titles: Record<string, string> = {};
  for (const s of overview.pendingSubjects) {
    titles[s.subjectId] = s.title;
  }
  const missing = predictions
    .filter((p) => p.subjectType === "content_output" && !titles[p.subjectId])
    .map((p) => p.subjectId);
  const unique = Array.from(new Set(missing));
  await Promise.all(
    unique.map(async (outputId) => {
      try {
        const output = (await client.getOutput({
          params: { outputId },
          query: undefined,
          body: undefined,
        })) as unknown as { title?: string };
        if (output?.title) titles[outputId] = output.title;
      } catch {
        /* unresolvable — the caller falls back to the raw id */
      }
    }),
  );
  return titles;
}

export async function loadCalibrationWorkbench(
  client: CalibrationReadClient = defaultClient,
): Promise<CalibrationWorkbenchData> {
  const [overview, predictions, rubric] = await Promise.all([
    loadOverview(client),
    loadPredictions(client),
    loadRubric(client),
  ]);
  const subjectTitles = await resolveSubjectTitles(
    client,
    overview,
    predictions,
  );
  return { overview, predictions, rubric, subjectTitles };
}
