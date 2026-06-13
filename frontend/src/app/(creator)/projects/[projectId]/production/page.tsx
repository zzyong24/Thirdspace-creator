/**
 * Production Workspace route (Task 16).
 *
 * `/projects/[projectId]/production` renders the project-workspace
 * Header mode page for the Production stage (page-specs §8). The route
 * lives inside the `(creator)` segment so the shared AppShell (one
 * Sidebar + one TopHeader in `project-workspace` mode, with the
 * Production stage active) wraps it; the page itself is a Server
 * Component.
 */

import { ProductionWorkspacePage } from "@/features/production/production-workspace-page";

interface ProductionWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ProductionWorkspaceRoute({
  params,
}: ProductionWorkspaceRouteProps) {
  const { projectId } = await params;
  return <ProductionWorkspacePage projectId={projectId} />;
}
