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
import {
  loadScriptEditorData,
  loadPlanningOutline,
  type ScriptDataClient,
} from "@/features/script/script-editor-data";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

interface ScriptWorkspaceRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

export default async function ScriptWorkspaceRoute({
  params,
}: ScriptWorkspaceRouteProps) {
  const { projectId } = await params;
  // Session → ctx (layout already guarded). No session → fixture-deriving page.
  const session = await resolveSession();
  if (!session) {
    return <ScriptWorkspacePage projectId={projectId} />;
  }
  // Round-trip: read the 分镜脚本 artifact's CURRENT version so a previously-saved
  // or AI-drafted script shows up in the editor (Plan: 脚本编辑器做真). The read goes
  // through the user-scoped client so a logged-in user only sees their own ctx
  // artifacts (empty account → null → fixture fallback). Falls back to the
  // fixture sections when nothing is persisted (loader returns null).
  const client = createServerClient(session.ctx) as unknown as ScriptDataClient;
  const vm = buildScriptViewModel(projectId);
  const scriptData = await loadScriptEditorData(vm.scriptArtifactId, client);
  // SEAM-02:脚本"大纲"区优先读策划的结构方案(content_outline artifact);策划已搭好结构时,
  // 大纲来自上游蓝图,而非脚本自身段落标题派生。无策划结构方案则回退脚本派生大纲(scriptData.outline)。
  const planningOutline = await loadPlanningOutline(projectId, client);
  const outlineOverride =
    planningOutline ?? (scriptData ? scriptData.outline : null);
  return (
    <ScriptWorkspacePage
      projectId={projectId}
      sectionsOverride={scriptData?.sections ?? null}
      // T-019(L4):TipTap 初值 —— 当前版本的 contentData.html 优先(忠实往返),
      // 否则从 sections 拼;null 时页面回退 fixture sections 拼接。
      editorHtmlOverride={scriptData?.editorHtml ?? null}
      versionsOverride={scriptData ? scriptData.versions : null}
      outlineOverride={outlineOverride}
      goldenQuotesOverride={scriptData ? scriptData.goldenQuotes : null}
      aiSuggestionsGuide={scriptData !== null}
    />
  );
}