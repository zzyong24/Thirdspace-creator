/**
 * Analytics & Review route (Task 18).
 *
 * `/projects/[projectId]/review` renders the project-workspace Header
 * mode page for the Review stage (page-specs §10). The route lives
 * inside the `(creator)` segment so the shared AppShell (one Sidebar
 * + one TopHeader in `project-workspace` mode, with the Review stage
 * active) wraps it; the page itself is a Server Component.
 */

import { AnalyticsReviewPage } from "@/features/review/analytics-review-page";

interface AnalyticsReviewRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function AnalyticsReviewRoute({
  params,
}: AnalyticsReviewRouteProps) {
  const { projectId } = await params;
  return <AnalyticsReviewPage projectId={projectId} />;
}
