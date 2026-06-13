/**
 * Planning Workspace route (Task 14).
 *
 * `/projects/[projectId]/planning` renders the project-workspace
 * Header mode page for the Planning stage (page-specs §6). The route
 * lives inside the `(creator)` segment so the shared AppShell (one
 * Sidebar + one TopHeader in `project-workspace` mode, with the
 * Planning stage active) wraps it; the page itself is a Server
 * Component.
 */

import { PlanningWorkspacePage } from "@/features/planning/planning-workspace-page";

interface PlanningWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function PlanningWorkspaceRoute({
  params,
}: PlanningWorkspaceRouteProps) {
  const { projectId } = await params;
  return <PlanningWorkspacePage projectId={projectId} />;
}
