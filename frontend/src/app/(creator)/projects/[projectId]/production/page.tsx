/**
 * [T-254c] 制作视频阶段页(SPEC 2026-07-11 §3.3)—— 复活 [T-076] 退役的 production
 * 前端(当时后端 6 op 契约零删除保留,注释明写「将来回归时复用」,现在回归)。
 *
 * Server Component:按 review 页同款读侧模式(session → user-scoped client),
 * 读三样真值再交给 ProductionWorkbench 客户端岛:
 *   - 口播稿:稿面同一读路径(resolveScriptArtifactIdFromDb → loadScriptEditorData
 *     的 sections 投影拼纯文本)—— 提词展示 + SRT 相似度校验的基准;
 *   - 项目首个产出 outputId(没有 → null,岛内状态机接线时懒建);
 *   - production 状态 + 已登记分场数(outputs.production.get 是 get-or-create,
 *     首访即落一行 drafting —— 与后端注释语义一致)。
 * 任何读失败诚实降级(null / 0),页面不炸。
 */

import { ProductionWorkbench } from "@/features/production/production-workbench";
import {
  loadScriptEditorData,
  resolveScriptArtifactIdFromDb,
  type ScriptDataClient,
} from "@/features/script/script-editor-data";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

interface ProductionRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
}

// URL 段可能是标题 slug(与 [projectId]/layout.tsx 同款解析);解析不出保持原值。
function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface ScopedClient {
  listProjects(input: {
    params: undefined;
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  listOutputs(input: {
    params: { projectId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  getOutputProduction(input: {
    params: { outputId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
  listSegments(input: {
    params: { productionId: string };
    query: undefined;
    body: undefined;
  }): Promise<unknown>;
}

async function resolveProject(
  client: ScopedClient,
  param: string,
): Promise<{ id: string; title: string } | null> {
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<{ id: string; title: string }>;
    const byId = projects.find((p) => p.id === param);
    if (byId) return byId;
    const slug = param.toLowerCase();
    return projects.find((p) => slugifyTitle(p.title) === slug) ?? null;
  } catch {
    return null;
  }
}

/** 稿面 sections 投影 → 提词用纯文本口播稿(段落间空行;无稿 → null 诚实空态)。 */
function sectionsToScriptText(
  sections: ReadonlyArray<{ heading: string; body: string }> | null,
): string | null {
  if (!sections || sections.length === 0) return null;
  const text = sections
    .map((s) => [s.heading.trim(), s.body.trim()].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return text.length > 0 ? text : null;
}

export default async function ProductionRoute({ params }: ProductionRouteProps) {
  const { projectId: param } = await params;
  const session = await resolveSession();
  if (!session) {
    // SSR 兜底(未登录/测试):渲染诚实空态的工作台,不 301、不编数据。
    return (
      <ProductionWorkbench
        projectId={param}
        projectTitle=""
        scriptText={null}
        outputId={null}
        initialStatus={null}
        initialSegmentCount={0}
      />
    );
  }
  const scoped = createServerClient(session.ctx) as unknown as ScopedClient;
  const project = await resolveProject(scoped, param);
  const projectId = project?.id ?? param;

  // 口播稿(稿面同一读路径;读失败 → null 诚实空态)。
  const scriptArtifactId = await resolveScriptArtifactIdFromDb(
    projectId,
    scoped as unknown as ScriptDataClient,
  );
  const scriptData = await loadScriptEditorData(
    scriptArtifactId,
    scoped as unknown as ScriptDataClient,
  );
  const scriptText = sectionsToScriptText(scriptData?.sections ?? null);

  // 项目首个产出 + production 状态 + 分场数(全 best-effort)。
  let outputId: string | null = null;
  let initialStatus: string | null = null;
  let initialSegmentCount = 0;
  try {
    const outputs = (await scoped.listOutputs({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ReadonlyArray<{ id: string }>;
    outputId = outputs[0]?.id ?? null;
    if (outputId) {
      const production = (await scoped.getOutputProduction({
        params: { outputId },
        query: undefined,
        body: undefined,
      })) as { id: string; status: string };
      initialStatus = production.status;
      const segments = (await scoped.listSegments({
        params: { productionId: production.id },
        query: undefined,
        body: undefined,
      })) as ReadonlyArray<unknown>;
      initialSegmentCount = segments.length;
    }
  } catch {
    /* 读失败诚实降级:状态条从 drafting 起,分场数 0 */
  }

  return (
    <ProductionWorkbench
      projectId={projectId}
      projectTitle={project?.title ?? ""}
      scriptText={scriptText}
      outputId={outputId}
      initialStatus={initialStatus}
      initialSegmentCount={initialSegmentCount}
    />
  );
}
