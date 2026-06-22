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
import { buildScriptViewModel } from "@/fixtures/selectors";
import { loadScriptEditorSections } from "@/features/script/script-editor-data";

interface ScriptWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ScriptWorkspaceRoute({
  params,
}: ScriptWorkspaceRouteProps) {
  const { projectId } = await params;
  // Round-trip: read the 分镜脚本 artifact's CURRENT version so a previously-saved
  // or AI-drafted script shows up in the editor (Plan: 脚本编辑器做真). Falls back to
  // the fixture sections when nothing is persisted (loader returns null).
  const vm = buildScriptViewModel(projectId);
  const sectionsOverride = await loadScriptEditorSections(vm.scriptArtifactId);
  return (
    <ScriptWorkspacePage
      projectId={projectId}
      sectionsOverride={sectionsOverride}
    />
  );
}