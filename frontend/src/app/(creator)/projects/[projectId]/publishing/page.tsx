/**
 * Publishing Workspace route (Task 17).
 *
 * `/projects/[projectId]/publishing` renders the project-workspace
 * Header mode page for the Publishing stage (page-specs §9). The route
 * lives inside the `(creator)` segment so the shared AppShell (one
 * Sidebar + one TopHeader in `project-workspace` mode, with the
 * Publishing stage active) wraps it; the page itself is a Server
 * Component.
 */

import { PublishingWorkspacePage } from "@/features/project-publishing/publishing-workspace-page";

interface PublishingWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function PublishingWorkspaceRoute({
  params,
}: PublishingWorkspaceRouteProps) {
  const { projectId } = await params;
  return <PublishingWorkspacePage projectId={projectId} />;
}