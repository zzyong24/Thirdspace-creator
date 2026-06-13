/**
 * Research Workspace route (Task 13).
 *
 * `/projects/[projectId]/research` renders the project-workspace
 * Header mode page for the Research stage (page-specs §5). The route
 * lives inside the `(creator)` segment so the shared AppShell (one
 * Sidebar + one TopHeader in `project-workspace` mode, with the
 * Research stage active) wraps it; the page itself is a Server
 * Component.
 */

import { ResearchWorkspacePage } from "@/features/research/research-workspace-page";

interface ResearchWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ResearchWorkspaceRoute({
  params,
}: ResearchWorkspaceRouteProps) {
  const { projectId } = await params;
  return <ResearchWorkspacePage projectId={projectId} />;
}