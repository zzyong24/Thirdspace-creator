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
import {
  loadScriptEditorData,
  loadPlanningOutline,
  resolveScriptArtifactIdFromDb,
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
  // [T-050] ctx 恒有(T-046 免登录直通)。异常态(库里没用户)渲染诚实空,不再裸 fixture。
  const session = await resolveSession();
  if (!session) {
    return (
      <ScriptWorkspacePage
        projectId={projectId}
        sectionsOverride={[]}
        versionsOverride={[]}
        outlineOverride={[]}
        goldenQuotesOverride={[]}
        aiSuggestionsGuide
      />
    );
  }
  // Round-trip: read the 分镜脚本 artifact's CURRENT version so a previously-saved
  // or AI-drafted script shows up in the editor (Plan: 脚本编辑器做真)。
  // [T-050] artifactId 从 DB 解析(output_script 优先,回退 master_script)——原先走
  // fixture 查表(canonicalDataset.artifacts),真项目永远 miss → 全站渲染 demo 脚本。
  // 无 artifact / 无版本 → 空数组 override(真实空态),demo sections 永不落到真项目上。
  const client = createServerClient(session.ctx) as unknown as ScriptDataClient;
  const scriptArtifactId = await resolveScriptArtifactIdFromDb(projectId, client);
  const scriptData = await loadScriptEditorData(scriptArtifactId, client);
  // SEAM-02:脚本"大纲"区优先读策划的结构方案(content_outline artifact);策划已搭好结构时,
  // 大纲来自上游蓝图,而非脚本自身段落标题派生。无策划结构方案则回退脚本派生大纲(scriptData.outline)。
  const planningOutline = await loadPlanningOutline(projectId, client);
  const outlineOverride =
    planningOutline ?? (scriptData ? scriptData.outline : []);
  return (
    <ScriptWorkspacePage
      projectId={projectId}
      scriptArtifactIdOverride={scriptArtifactId}
      sectionsOverride={scriptData?.sections ?? []}
      // T-019(L4):TipTap 初值 —— 当前版本的 contentData.html 优先(忠实往返),
      // 否则从 sections 拼;null 时页面从(空)sections 拼接。
      editorHtmlOverride={scriptData?.editorHtml ?? null}
      versionsOverride={scriptData ? scriptData.versions : []}
      outlineOverride={outlineOverride}
      goldenQuotesOverride={scriptData ? scriptData.goldenQuotes : []}
      aiSuggestionsGuide
    />
  );
}