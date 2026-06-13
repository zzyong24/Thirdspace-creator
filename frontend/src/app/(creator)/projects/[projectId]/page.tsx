/**
 * Project Overview route (Task 12).
 *
 * `/projects/[projectId]` renders the project-overview Header mode page
 * (page-specs §4). The route lives inside the `(creator)` segment so the
 * shared AppShell (one Sidebar + one TopHeader in `project-overview`
 * mode) wraps it; the page itself is a Server Component.
 */

import { ProjectOverviewPage } from "@/features/project-overview/project-overview-page";

interface ProjectOverviewRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ProjectOverviewRoute({
  params,
}: ProjectOverviewRouteProps) {
  const { projectId } = await params;
  return <ProjectOverviewPage projectId={projectId} />;
}
