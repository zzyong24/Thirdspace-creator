import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { CrossAccountEmptyState } from "@/components/state/page-state";
import { isOwnershipError } from "@/features/project-overview/project-overview-workspace-data";
import { resolveProjectRoute } from "@/features/projects/project-route-data";

/** 隐藏制作工作台，旧链接仍先验证真实归属；不读取或初始化制作状态。 */
export default async function ProductionRoute({params, searchParams}: {
  params: Promise<{projectId: string}>;
  searchParams?: Promise<{outputId?: string}>;
}) {
  const {projectId: param} = await params;
  const session = await resolveSession();
  if (!session || (!session.ctx.groupId && !session.ctx.accountId)) notFound();
  const scoped = createServerClient(session.ctx);
  let project: Awaited<ReturnType<typeof scoped.getProject>>;
  try { project = await resolveProjectRoute(param, scoped); } catch (error) {
    if (isOwnershipError(error)) return <main data-page="project-cross-account-404"><CrossAccountEmptyState groupId={session.ctx.groupId} entityLabel="项目" backHref="/projects" backLabel="回项目列表" /></main>;
    notFound();
  }
  if (!project) notFound();
  const outputId = (await searchParams)?.outputId;
  if (outputId) {
    let output: Awaited<ReturnType<typeof scoped.getOutput>>;
    try { output = await scoped.getOutput({params: {outputId}, query: undefined, body: undefined}); } catch { notFound(); }
    if (output.projectId !== project.id || output.contentType !== "video") notFound();
  }
  redirect(`/projects/${encodeURIComponent(project.id)}`);
}
