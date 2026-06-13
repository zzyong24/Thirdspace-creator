/**
 * Script Workspace route (Task 15).
 *
 * `/projects/[projectId]/script` renders the project-workspace
 * Header mode page for the Script stage (page-specs §7). The route
 * lives inside the `(creator)` segment so the shared AppShell (one
 * Sidebar + one TopHeader in `project-workspace` mode, with the
 * Script stage active) wraps it; the page itself is a Server
 * Component.
 */

import { ScriptWorkspacePage } from "@/features/script/script-workspace-page";

interface ScriptWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ScriptWorkspaceRoute({
  params,
}: ScriptWorkspaceRouteProps) {
  const { projectId } = await params;
  return <ScriptWorkspacePage projectId={projectId} />;
}