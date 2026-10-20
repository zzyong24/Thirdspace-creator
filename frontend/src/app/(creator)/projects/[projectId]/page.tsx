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
  buildDraftWorkbenchVm,
  type DraftWorkbenchClient,
} from "@/features/draft-workbench/draft-workbench-data";
import { isOwnershipError } from "@/features/project-overview/project-overview-workspace-data";
import { CrossAccountEmptyState } from "@/components/state/page-state";
import { resolveSession } from "@/lib/session.server";
import { createServerClient } from "@/lib/contract-client.server";

interface DraftWorkbenchRouteProps {
  readonly params: Promise<{ readonly projectId: string }>;
  readonly searchParams?: Promise<{ readonly view?: string; readonly from?: string }>;
}

export default async function DraftWorkbenchRoute({
  params,
  searchParams,
}: DraftWorkbenchRouteProps) {
  const { projectId } = await params;
  const { view, from } = (await searchParams) ?? {};

  const session = await resolveSession();
  if (!session) {
    // T-046 后 session 恒有;异常态(库中无用户)诚实 404,不渲染 fixture。
    notFound();
  }

  const sessionClient = createServerClient({...session.ctx,accountId:session.ctx.groupId?null:session.ctx.accountId});
  const resolvedId = await resolveProjectIdParam(projectId, sessionClient);
  const scoped = sessionClient as unknown as DraftWorkbenchClient;
  if (view === "works") {
    let overview: { projectId: string; projectTitle: string; outputs: ProjectWorkOutput[] } | null = null;
    let crossAccountOverview = false;
    let accountPlatform: string | null = null;
    try {
      const project = await scoped.getProject({ params: { projectId: resolvedId }, query: undefined, body: undefined }) as { id: string; title: string };
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
  let vm: Awaited<ReturnType<typeof buildDraftWorkbenchVm>> | null = null;
  let crossAccount = false;
  try {
    vm = await buildDraftWorkbenchVm(resolvedId, scoped);
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
  if (vm === null) notFound();
  return <DraftWorkbenchPage vm={vm} autoFillBrief={from === "topic"} />;
}

/**
 * URL `[projectId]` 段 → canonical 项目 id(沿用旧总览页的解析:完整 id 直通,
 * kebab 化标题兜底;都不中回原参 → 上层 404)。
 */
async function resolveProjectIdParam(param: string, scoped: Pick<ReturnType<typeof createServerClient>, "listProjects">): Promise<string> {
  if (!param) return param;
  try {
    const projects = (await scoped.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 100 },
      body: undefined,
    })) as unknown as ReadonlyArray<{ id: string; title: string }>;
    if (projects.some((project) => project.id === param)) {
      return param;
    }
    const slug = param.toLowerCase();
    const match = projects.find(
      (project) => slugifyTitle(project.title) === slug,
    );
    return match?.id ?? param;
  } catch {
    return param;
  }
}

function slugifyTitle(title: string): string {
  const asciiOnly = title.replace(/[^\x20-\x7E]/g, " ");
  return asciiOnly
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
