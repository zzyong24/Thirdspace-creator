import { notFound } from "next/navigation";

import { GraphicPostWorkbench } from "@/features/projects/graphic-post-workbench";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function GraphicPostPage({ params, searchParams }: {
  params: Promise<{ projectId: string; outputId: string }>;
  searchParams?: Promise<{ start?: string }>;
}) {
  const session = await resolveSession();
  if (!session?.ctx.accountId) notFound();
  const { projectId, outputId } = await params;
  const initialStartStatus = (await searchParams)?.start;
  const scoped = createServerClient(session.ctx);
  let project: Awaited<ReturnType<typeof scoped.getProject>>;
  let post: Awaited<ReturnType<typeof scoped.getGraphicPost>>;
  try {
    project = await scoped.getProject({ params: { projectId }, query: undefined, body: undefined });
    const output = await scoped.getOutput({ params: { outputId }, query: undefined, body: undefined });
    if (output.projectId !== project.id || output.contentType !== "image") notFound();
    post = await scoped.getGraphicPost({ params: { outputId }, query: undefined, body: undefined });
  } catch {
    notFound();
  }
  return <GraphicPostWorkbench projectId={project.id} projectTitle={project.title} accountId={session.ctx.accountId}
    initial={post} initialStartStatus={initialStartStatus} />;
}
