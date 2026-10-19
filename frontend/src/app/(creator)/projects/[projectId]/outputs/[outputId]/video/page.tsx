import { notFound } from "next/navigation";

import { VideoOutputWorkbench } from "@/features/projects/video-output-workbench";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function VideoOutputPage({ params, searchParams }: {
  params: Promise<{ projectId: string; outputId: string }>;
  searchParams?: Promise<{ sourceItemId?: string; start?: string }>;
}) {
  const session = await resolveSession();
  if(!session||(!session.ctx.groupId&&!session.ctx.accountId))notFound();
  const { projectId, outputId } = await params;
  const query = (await searchParams) ?? {};
  const sourceItemId = query.sourceItemId;
  const scoped = createServerClient({...session.ctx,accountId:session.ctx.groupId?null:(session.ctx.accountId??null)});
  let project: Awaited<ReturnType<typeof scoped.getProject>>;
  let output: Awaited<ReturnType<typeof scoped.getOutput>>;
  try {
    project = await scoped.getProject({ params: { projectId }, query: undefined, body: undefined });
    output = await scoped.getOutput({ params: { outputId }, query: undefined, body: undefined });
    if (output.projectId !== project.id || output.contentType !== "video") notFound();
  } catch { notFound(); }
  return <VideoOutputWorkbench projectId={project.id} projectTitle={project.title} outputId={output.id}
    outputTitle={output.title} targetPlatform={output.targetPlatform ?? null} accountId={session.ctx.groupId?null:(session.ctx.accountId??null)}
    sourceItemId={sourceItemId} initialStartStatus={query.start} />;
}
