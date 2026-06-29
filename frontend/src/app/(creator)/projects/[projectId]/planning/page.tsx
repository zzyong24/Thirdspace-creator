/**
 * Planning Workspace route (Task 14).
 *
 * `/projects/[projectId]/planning` renders the project-workspace
 * Header mode page for the Planning stage (page-specs §6). The route
 * lives inside the `(creator)` segment so the shared AppShell (one
 * Sidebar + one TopHeader in `project-workspace` mode, with the
 * Planning stage active) wraps it; the page itself is a Server
 * Component.
 *
 * READ side made real ("策划工作台读侧做真"): instead of letting the page derive
 * its ViewModel from the fixture selector (which renders "未找到项目" for any
 * non-canonical project), the route assembles a REAL PlanningViewModel from
 * `projects.get` + `artifacts.list` + `artifacts.versions.list`, falling back to
 * the fixture VM per-field / wholesale on failure. See
 * `planning-workspace-data.ts` for the assembly + degradation contract.
 */

import { PlanningWorkspacePage } from "@/features/planning/planning-workspace-page";
import {
  buildPlanningWorkspaceViewModel,
  type PlanningDataClient,
} from "@/features/planning/planning-workspace-data";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

interface PlanningWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function PlanningWorkspaceRoute({
  params,
}: PlanningWorkspaceRouteProps) {
  const { projectId } = await params;
  // Session → ctx (layout already guarded). No session → fixture-deriving page.
  const session = await resolveSession();
  if (!session) {
    return <PlanningWorkspacePage projectId={projectId} />;
  }
  // User-scoped read: an empty account reads empty, not the canonical seed.
  const client = createServerClient(
    session.ctx,
  ) as unknown as PlanningDataClient;
  const { viewModel, thesisArtifactId, contractArtifactId, outlineArtifactId } =
    await buildPlanningWorkspaceViewModel(projectId, client);
  return (
    <PlanningWorkspacePage
      projectId={projectId}
      viewModel={viewModel}
      thesisArtifactId={thesisArtifactId}
      contractArtifactId={contractArtifactId}
      outlineArtifactId={outlineArtifactId}
    />
  );
}
