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
import Link from "next/link";
import { selectProductionOutput,resolveProductionScriptArtifactId,type ProductionOutputRef } from "@/features/production/production-output-data";
import {
  loadScriptEditorData,
  type ScriptDataClient,
} from "@/features/script/script-editor-data";
import { isOwnershipError } from "@/features/project-overview/project-overview-workspace-data";
import { CrossAccountEmptyState } from "@/components/state/page-state";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { resolveProjectScriptText } from "@/server/project-script-truth";

interface ProductionRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
  readonly searchParams?:Promise<{readonly outputId?:string}>;
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
  // [T-373] 跨号整页门的所有权探针(OwnershipError → 整页诚实引导)。
  getProject(input: {
    params: { projectId: string };
    query: undefined;
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

interface ProjectWithRadarDraft {
  readonly id: string;
  readonly title?: string;
  readonly briefDetail?: unknown;
}

async function resolveProject(
  client: ScopedClient,
  param: string,
): Promise<{
  id: string;
  title: string;
  // [T-290] 画幅(briefDetail.orientation)→ 渲染 delivery 尺寸;listProjects 返回全量 projectResource(含 briefDetail)。
  orientation?: "portrait" | "landscape";
} | null> {
  try {
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as ReadonlyArray<{
      id: string;
      title: string;
      briefDetail?: { orientation?: "portrait" | "landscape" | null } | null;
    }>;
    const pick = (p: {
      id: string;
      title: string;
      briefDetail?: { orientation?: "portrait" | "landscape" | null } | null;
    }) => ({
      id: p.id,
      title: p.title,
      orientation: p.briefDetail?.orientation ?? undefined,
    });
    const byId = projects.find((p) => p.id === param);
    if (byId) return pick(byId);
    const slug = param.toLowerCase();
    const bySlug = projects.find((p) => slugifyTitle(p.title) === slug);
    return bySlug ? pick(bySlug) : null;
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

export default async function ProductionRoute({ params,searchParams }: ProductionRouteProps) {
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

  // [T-373] 跨号整页门:项目按当前号读不到(OwnershipError,跨号/未知同貌,不泄露
  // 存在性)→ 整页诚实引导(与稿面根路由 T-332 S4 / review 页同款),不再半渲染
  // (此前逐区 best-effort 降级,跨号项目照渲工作台空壳)。其他读失败维持原降级。
  let ownedProject: ProjectWithRadarDraft | null = null;
  try {
    ownedProject = (await scoped.getProject({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ProjectWithRadarDraft;
  } catch (err) {
    if (isOwnershipError(err)) {
      return (
        <main
          data-app="creatoros"
          data-page="project-cross-account-404"
          className="flex flex-col gap-card-gap"
        >
          <CrossAccountEmptyState
            entityLabel="项目"
            backHref="/projects"
            backLabel="回项目列表"
          />
        </main>
      );
    }
  }

  const requestedId=(await searchParams)?.outputId;
  let outputs:ReadonlyArray<ProductionOutputRef>;
  try {outputs=await scoped.listOutputs({params:{projectId},query:undefined,body:undefined}) as ReadonlyArray<ProductionOutputRef>;} catch {
    return <main data-page="production-read-error"><h1>视频制作</h1><p>作品列表暂未读取完成，请重试。</p><Link href={`/projects/${encodeURIComponent(projectId)}/production`}>重新读取</Link></main>;
  }
  const selection=selectProductionOutput(outputs,requestedId);
  if(selection.invalid)return <CrossAccountEmptyState entityLabel="视频作品" backHref={`/projects/${encodeURIComponent(projectId)}`} backLabel="回项目" />;
  if(!selection.output && outputs.length>0)return <main data-page="production-output-selection" className="space-y-4"><h1 className="text-xl font-semibold">选择要制作的视频</h1>
    <p className="text-sm text-muted-foreground">{selection.videos.length?"每条视频独立保存素材、剪辑方案和成片。":"该项目还没有视频作品，请先创建视频。"}</p>
    <ul className="space-y-2">{selection.videos.map(output=><li key={output.id}><Link className="text-primary hover:underline" href={`/projects/${encodeURIComponent(projectId)}/production?outputId=${encodeURIComponent(output.id)}`}>{output.title || "未命名视频"}</Link></li>)}</ul>
    <Link href={`/projects/${encodeURIComponent(projectId)}`} className="text-primary hover:underline">回项目</Link></main>;
  const selectedOutput=selection.output;
  // 只读此作品的正式脚本；唯一视频兼容原项目母稿，多视频不回退别的作品。
  let scriptArtifactId:string|null=null;
  try {scriptArtifactId = await resolveProductionScriptArtifactId(scoped as unknown as ScriptDataClient,projectId,selectedOutput?.id??"",selection.videos.length<=1);} catch { /* 读取失败仍可继续备料；不回退另一条作品脚本。 */ }
  const scriptData = await loadScriptEditorData(
    scriptArtifactId,
    scoped as unknown as ScriptDataClient,
  );
  const scriptText = resolveProjectScriptText({
    persistedText: sectionsToScriptText(scriptData?.sections ?? null),
    persistedVersionCount: scriptData?.versions.length ?? 0,
    briefDetail: selection.videos.length<=1?ownedProject?.briefDetail:undefined,
  });

  // 项目首个产出 + production 状态 + 分场数(全 best-effort)。
  const outputId=selectedOutput?.id??null;
  let initialStatus: string | null = null;
  let initialSegmentCount = 0;
  try {
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
      orientation={project?.orientation}
    />
  );
}
