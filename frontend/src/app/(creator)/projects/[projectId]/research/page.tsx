/**
 * Research Workspace route (Task 13 / Task #90 read-side made real).
 *
 * `/projects/[projectId]/research` renders the project-workspace
 * Header mode page for the Research stage (page-specs §5). The route
 * lives inside the `(creator)` segment so the shared AppShell (one
 * Sidebar + one TopHeader in `project-workspace` mode, with the
 * Research stage active) wraps it; the page itself is a Server
 * Component.
 *
 * READ side made real (Task #90): instead of letting the page derive its
 * ViewModel from the fixture selector (which renders "未找到项目" for any
 * non-canonical project), the route assembles a REAL ResearchViewModel from
 * `projects.get` + `materialLinks.list` + `knowledge.get`, falling back to the
 * fixture VM per-field / wholesale on failure. See
 * `research-workspace-data.ts` for the assembly + degradation contract.
 */

import { ResearchWorkspacePage } from "@/features/research/research-workspace-page";
import { buildResearchWorkspaceViewModel } from "@/features/research/research-workspace-data";

interface ResearchWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ResearchWorkspaceRoute({
  params,
}: ResearchWorkspaceRouteProps) {
  const { projectId } = await params;
  const viewModel = await buildResearchWorkspaceViewModel(projectId);
  return <ResearchWorkspacePage projectId={projectId} viewModel={viewModel} />;
}