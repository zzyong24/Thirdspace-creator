/**
 * Analytics & Review route (Task 18 / module 11 Task 5).
 *
 * `/projects/[projectId]/review` renders the project-workspace Header
 * mode page for the Review stage (page-specs §10). The route lives
 * inside the `(creator)` segment so the shared AppShell (one Sidebar
 * + one TopHeader in `project-workspace` mode, with the Review stage
 * active) wraps it; the page itself is a Server Component.
 *
 * Module 11 server read switch: the route fetches the REAL op
 * `analytics.projects.get` (user-scoped pglite) and builds the page
 * ViewModel from the returned `MetricSnapshot[]` via
 * `buildAnalyticsReviewViewModelFromOp`. The per-tab window
 * re-derivation stays a pure client selector over the already-fetched
 * data (no new fetch per tab). A resolution failure degrades to the
 * deterministic fixture default so the page never crashes.
 */

import { AnalyticsReviewPage } from "@/features/review/analytics-review-page";
import {
  buildAnalyticsReviewViewModelFromOp,
  type MetricSnapshotDto,
} from "@/features/review/analytics-review-view-model";
import type { AnalyticsViewModel } from "@/types/view-models";
import { client } from "@/lib/contract-client.server";

interface AnalyticsReviewRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

// Module 11 Step 5 — resolve the review ViewModel server-side from the REAL
// `analytics.projects.get` op (user-scoped pglite). The op responds with the
// project's owned MetricSnapshot[]; the builder overlays that live signal onto the
// deterministic fixture-derived chart shapes (Open Question #2 defers the
// value/retention/audience read ops). A resolution failure degrades to the fixture
// default so the page renders its default/empty copy instead of crashing.
async function resolveReviewViewModel(
  resolvedId: string,
): Promise<AnalyticsViewModel | undefined> {
  try {
    const snapshots = (await client.getProjectAnalytics({
      params: { projectId: resolvedId },
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<MetricSnapshotDto>;
    return buildAnalyticsReviewViewModelFromOp(resolvedId, snapshots);
  } catch {
    return undefined;
  }
}

export default async function AnalyticsReviewRoute({
  params,
}: AnalyticsReviewRouteProps) {
  const { projectId } = await params;
  const resolvedId = await resolveProjectIdParam(projectId);
  const viewModel = await resolveReviewViewModel(resolvedId);
  // Module 13 Step 5 — supply the Reviews wiring so the authoring panel + history
  // drill call the real ops (reviews.create/insights.create/complete/get) over the
  // dispatch route, then router.refresh().
  return (
    <AnalyticsReviewPage
      projectId={resolvedId}
      viewModel={viewModel}
      reviewsWiring={{ projectId: resolvedId }}
    />
  );
}

/**
 * Resolve the URL `[projectId]` segment to a canonical project id against the
 * REAL persisted project list (`projects.list`). Mirrors the
 * publishing/production routes so a slug like `ai-native-browser` collapses to
 * the canonical `project-ainativebrowser` (matched on the kebab-cased project
 * title) before the feature renders. If no project matches (or the read fails),
 * the original param is passed through so the page surfaces its empty state
 * instead of crashing.
 */
async function resolveProjectIdParam(param: string): Promise<string> {
  if (!param) return param;
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; title: string }>;
    if (projects.some((project) => project.id === param)) {
      return param;
    }
    const slug = param.toLowerCase();
    const match = projects.find(
      (project) => slugifyTitle(project.title) === slug,
    );
    return match?.id ?? param;
  } catch {
    return param;
  }
}

function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
