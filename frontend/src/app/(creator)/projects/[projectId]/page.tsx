/**
 * 项目主路由 → 稿面工作台(T-055a,SPEC §3.3)。
 *
 * `/projects/[projectId]` 从「七阶段总览页」重做为「稿面工作台」——一个项目 =
 * 一张不断成熟的稿子(选题卡 → 口播脚本 → 发布包 + 弹药抽屉),阶段降级为顶条
 * 成熟度标记。原 research/planning/script/publishing 四阶段路由 301 到本页锚点。
 *
 * Server Component:session ctx 下读(跨用户/未知项目 → 404);无 session
 * (SSR 兜底/测试)渲染空态壳,绝不 fixture。
 */

import { notFound } from "next/navigation";

import { DraftWorkbenchPage } from "@/features/draft-workbench/draft-workbench-page";
import { ProjectOutputHome, type ProjectWorkOutput } from "@/features/projects/project-output-home";
import {
  buildDraftWorkbenchStream,
  type DraftWorkbenchClient,
} from "@/features/draft-workbench/draft-workbench-data";
import { isOwnershipError } from "@/features/project-overview/project-overview-workspace-data";
import { CrossAccountEmptyState } from "@/components/state/page-state";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";
import {resolveProjectRoute} from "@/features/projects/project-route-data";

interface DraftWorkbenchRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
  readonly searchParams?: Promise<{ readonly view?: string }>;
}

export default async function DraftWorkbenchRoute({
  params,
  searchParams,
}: DraftWorkbenchRouteProps) {
  const { projectId } = await params;
  const { view } = (await searchParams) ?? {};

  const session = await resolveSession();
  if (!session) {
    // T-046 后 session 恒有;异常态(库中无用户)诚实 404,不渲染 fixture。
    notFound();
  }

  const sessionClient = createServerClient({...session.ctx,accountId:session.ctx.groupId?null:session.ctx.accountId});
  let project: Awaited<ReturnType<typeof sessionClient.getProject>>;
  try {project=await resolveProjectRoute(projectId,sessionClient);}
  catch(error){
    if(isOwnershipError(error))return <main data-page="project-cross-account-404" className="flex flex-col gap-card-gap"><CrossAccountEmptyState groupId={session.ctx.groupId} entityLabel="项目" backHref="/projects" backLabel="回项目列表"/></main>;
    notFound();
  }
  const resolvedId = project.id;
  const scoped = sessionClient as unknown as DraftWorkbenchClient;
  if (view === "works") {
    let overview: { projectId: string; projectTitle: string; outputs: ProjectWorkOutput[] } | null = null;
    let crossAccountOverview = false;
    let accountPlatform: string | null = null;
    try {
      const outputs = await scoped.listOutputs({ params: { projectId: project.id }, query: undefined, body: undefined }) as unknown as ProjectWorkOutput[];
      overview = { projectId: project.id, projectTitle: project.title, outputs };
    } catch (err) {
      if (isOwnershipError(err)) crossAccountOverview = true;
      else notFound();
    }
    if (crossAccountOverview) return <main data-page="project-cross-account-404" className="flex flex-col gap-card-gap"><CrossAccountEmptyState entityLabel="项目" backHref="/projects" backLabel="回项目列表" /></main>;
    if (!overview) notFound();
    if (session.ctx.accountId) {
      try {
        const account = await sessionClient.getAccount({ params: { accountId: session.ctx.accountId }, query: undefined, body: undefined });
        accountPlatform = account.platform;
      } catch { /* 项目仍可创作，平台须由用户明确选择。 */ }
    }
    return <ProjectOutputHome projectId={overview.projectId} projectTitle={overview.projectTitle} initialOutputs={overview.outputs} accountId={session.ctx.groupId?null:session.ctx.accountId} accountPlatform={accountPlatform} />;
  }
  let data: Awaited<ReturnType<typeof buildDraftWorkbenchStream>> | null = null;
  let crossAccount = false;
  try {
    data = await buildDraftWorkbenchStream(resolvedId, scoped, project);
  } catch (err) {
    // [T-332 S4] 跨号/未知 by-id → OwnershipError 404(后端语义,不泄露存在性)。
    // 对用户最常见的成因是「切号后打开旧账号的项目深链」——裸 404 页不可理解,
    // 渲染可理解空态:解释「不属于当前账号」+ 回项目列表(SPEC §4.5/§6.4)。
    if (isOwnershipError(err)) {
      crossAccount = true;
    } else {
      // 项目读失败(未知 id 等)→ 404,与旧总览语义一致。
      notFound();
    }
  }

  if (crossAccount) {
    return (
      <main
        data-app="creatoros"
        data-page="project-cross-account-404"
        className="flex flex-col gap-card-gap"
      >
        <CrossAccountEmptyState
            groupId={session.ctx.groupId}
          entityLabel="项目"
          backHref="/projects"
          backLabel="回项目列表"
        />
      </main>
    );
  }

  // `notFound()` never returns, so the renderer below always has a VM.
  if (data === null) notFound();
  return <DraftWorkbenchPage vm={data.vm} deferred={data.deferred} />;
}
