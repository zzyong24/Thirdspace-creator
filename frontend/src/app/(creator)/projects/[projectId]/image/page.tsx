import { notFound, redirect } from "next/navigation";
import { ProjectOutputHome, type ProjectWorkOutput } from "@/features/projects/project-output-home";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

/** 图文工作面只读取既有作品，访问页面不会建立新稿。 */
export default async function ProjectImagePage({params}: {params: Promise<{projectId: string}>}) {
  const session = await resolveSession();
  if(!session||(!session.ctx.groupId&&!session.ctx.accountId))notFound();
  const {projectId} = await params;
  const scoped = createServerClient({...session.ctx,accountId:session.ctx.groupId?null:session.ctx.accountId});
  let project: Awaited<ReturnType<typeof scoped.getProject>>;
  let outputs: ProjectWorkOutput[];
  try {
    project = await scoped.getProject({params: {projectId}, query: undefined, body: undefined});
    outputs = await scoped.listOutputs({params: {projectId: project.id}, query: undefined, body: undefined}) as unknown as ProjectWorkOutput[];
  } catch { notFound(); }
  const images = outputs.filter(output => output.contentType === "image");
  if (images.length !== 1) return <ProjectOutputHome projectId={project.id} projectTitle={project.title}
    accountId={session.ctx.groupId?null:session.ctx.accountId} initialOutputs={images} initialType="image" />;
  // 将唯一真实作品写入深链；编导与刷新都绑定同一 output。
  redirect(`/projects/${encodeURIComponent(project.id)}/outputs/${encodeURIComponent(images[0]!.id)}/image`);
}
