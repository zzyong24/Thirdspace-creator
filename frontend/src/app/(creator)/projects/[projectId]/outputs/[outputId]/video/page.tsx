import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

/** 旧视频数据保留，制作入口按原项目与作品归属验证后回到脚本。 */
export default async function VideoOutputPage({params}: {
  params: Promise<{projectId: string; outputId: string}>;
  searchParams?: Promise<{sourceItemId?: string; start?: string}>;
}) {
  const session = await resolveSession();
  if (!session || (!session.ctx.groupId && !session.ctx.accountId)) notFound();
  const {projectId, outputId} = await params;
  const scoped = createServerClient({...session.ctx, accountId: session.ctx.groupId ? null : (session.ctx.accountId ?? null)});
  let project: Awaited<ReturnType<typeof scoped.getProject>>;
  let output: Awaited<ReturnType<typeof scoped.getOutput>>;
  try {
    project = await scoped.getProject({params: {projectId}, query: undefined, body: undefined});
    output = await scoped.getOutput({params: {outputId}, query: undefined, body: undefined});
  } catch { notFound(); }
  if (output.projectId !== project.id || output.contentType !== "video") notFound();
  redirect(`/projects/${encodeURIComponent(project.id)}`);
}
