/**
 * [T-254c] 制作视频阶段页(SPEC 2026-07-11 §3.3)—— 复活 [T-076] 退役的 production
 * 前端(当时后端 6 op 契约零删除保留,注释明写「将来回归时复用」,现在回归)。
 *
 * Server Component:按 review 页同款读侧模式(session → user-scoped client),
 * 读三样真值再交给 ProductionWorkbench 客户端岛:
 *   - 口播稿:稿面同一读路径(resolveScriptArtifactIdFromDb → loadScriptEditorData
 *     的 sections 投影拼纯文本)—— 提词展示 + SRT 相似度校验的基准;
 *   - 当前选定视频产出 outputId(没有 → null,岛内状态机接线时懒建);
 *   - production 状态 + 已登记分场数(outputs.production.get 是 get-or-create,
 *     首访即落一行 drafting —— 与后端注释语义一致)。
 * 任何读失败诚实降级(null / 0),页面不炸。
 */

import { ProductionEditorEntry } from "@/features/production/production-editor-entry";
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
import {resolveProjectRoute} from "@/features/projects/project-route-data";
import { resolveProjectScriptText } from "@/server/project-script-truth";

interface ProductionRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
  readonly searchParams?:Promise<{readonly outputId?:string}>;
}

type OwnedProject=Awaited<ReturnType<ReturnType<typeof createServerClient>["getProject"]>>;

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
      <ProductionEditorEntry
        projectId={param}
        projectTitle=""
        scriptText={null}
        outputId={null}
        initialStatus={null}
        initialSegmentCount={0}
      />
    );
  }
  const scoped = createServerClient(session.ctx);
  let project:OwnedProject|null=null;
  try {project=await resolveProjectRoute(param,scoped);}
  catch(err){
    if(isOwnershipError(err))return <main data-app="creatoros" data-page="project-cross-account-404" className="flex flex-col gap-card-gap">
      <CrossAccountEmptyState groupId={session.ctx.groupId} entityLabel="项目" backHref="/projects" backLabel="回项目列表"/>
    </main>;
  }
  const projectId=project?.id??param;

  const requestedId=(await searchParams)?.outputId;
  let outputs:ReadonlyArray<ProductionOutputRef>;
  try {outputs=await scoped.listOutputs({params:{projectId},query:undefined,body:undefined}) as unknown as ReadonlyArray<ProductionOutputRef>;} catch {
    return <main data-page="production-read-error"><h1>视频制作</h1><p>作品列表暂未读取完成，请重试。</p><Link href={`/projects/${encodeURIComponent(projectId)}/production`}>重新读取</Link></main>;
  }
  const selection=selectProductionOutput(outputs,requestedId);
  if(selection.invalid)return <CrossAccountEmptyState entityLabel="视频作品" backHref={`/projects/${encodeURIComponent(projectId)}`} backLabel="回项目" />;
  if(!selection.output && outputs.length>0)return <main data-page="production-output-selection" className="space-y-4"><h1 className="text-xl font-semibold">选择要制作的视频</h1>
    <p className="text-sm text-muted-foreground">{selection.videos.length?"每条视频独立保存素材、剪辑方案和成片。":"该项目还没有视频作品，请先创建视频。"}</p>
    <ul className="space-y-2">{selection.videos.map(output=><li key={output.id}><Link className="text-primary hover:underline" href={`/projects/${encodeURIComponent(projectId)}/production?outputId=${encodeURIComponent(output.id)}`}>{output.title || "未命名视频"}</Link></li>)}</ul>
    <Link href={`/projects/${encodeURIComponent(projectId)}`} className="text-primary hover:underline">回项目</Link></main>;
  const selectedOutput=selection.output;
  const outputId=selectedOutput?.id??null;
  // 已确认作品后，脚本与制作状态互不依赖，同时读取。
  const [scriptData,productionState]=await Promise.all([
    (async()=>{
      let scriptArtifactId:string|null=null;
      try {scriptArtifactId=await resolveProductionScriptArtifactId(scoped as unknown as ScriptDataClient,projectId,outputId??"",selection.videos.length<=1);}
      catch { /* 读取失败仍可继续备料；不回退另一条作品脚本。 */ }
      return loadScriptEditorData(scriptArtifactId,scoped as unknown as ScriptDataClient);
    })(),
    (async()=>{
      let initialStatus:string|null=null,initialSegmentCount=0;
      try {
        if(outputId){
          const production=await scoped.getOutputProduction({params:{outputId},query:undefined,body:undefined});
          initialStatus=production.status;
          const segments=await scoped.listSegments({params:{productionId:production.id},query:undefined,body:undefined}) as unknown as ReadonlyArray<unknown>;
          initialSegmentCount=segments.length;
        }
      }catch { /* 状态或分场读取失败不阻塞脚本。 */ }
      return {initialStatus,initialSegmentCount};
    })(),
  ]);
  const scriptText=resolveProjectScriptText({
    persistedText:sectionsToScriptText(scriptData?.sections??null),
    persistedVersionCount:scriptData?.versions.length??0,
    briefDetail:selection.videos.length<=1?project?.briefDetail:undefined,
  });
  const {initialStatus,initialSegmentCount}=productionState;
  const orientation=project?.briefDetail?.orientation;

  return (
    <ProductionEditorEntry
      projectId={projectId}
      projectTitle={project?.title ?? ""}
      scriptText={scriptText}
      outputId={outputId}
      initialStatus={initialStatus}
      initialSegmentCount={initialSegmentCount}
      orientation={orientation==="portrait"||orientation==="landscape"?orientation:undefined}
    />
  );
}
