import { notFound, redirect } from "next/navigation";

import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { ArticleWorkbench, type ArticleInitialRead, type ArticleBrandProfileRead } from "@/features/article/article-workbench";
import { ProjectOutputHome } from "@/features/projects/project-output-home";

interface ProjectRow {
  id: string;
  title: string;
}

interface OutputRow {
  id: string;
  title: string;
  contentType: string;
}

interface BrandStatementRow {
  id: string;
  versionNumber: number;
  oneLiner: string;
  masterSnapshot: unknown | null;
}

export default async function ProjectArticlePage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ outputId?: string }>;
}) {
  const session = await resolveSession();
  if (!session) notFound();
  const { projectId } = await params;
  const requestedOutputId = (await searchParams)?.outputId;
  const scoped = createServerClient({...session.ctx,accountId:session.ctx.groupId?null:session.ctx.accountId});
  let project: ProjectRow;
  let outputs: OutputRow[];
  try {
    project = await scoped.getProject({ params: { projectId }, query: undefined, body: undefined }) as ProjectRow;
    outputs = await scoped.listOutputs({ params: { projectId: project.id }, query: undefined, body: undefined }) as unknown as OutputRow[];
  } catch {
    notFound();
  }
  const articles = outputs.filter(output => output.contentType === "article");
  if (requestedOutputId && !articles.some(output => output.id === requestedOutputId)) notFound();
  if (!requestedOutputId && articles.length > 1) {
    return <ProjectOutputHome projectId={project.id} projectTitle={project.title} accountId={session.ctx.groupId?null:session.ctx.accountId}
      initialOutputs={articles} initialType="article" />;
  }
  if (!requestedOutputId && articles.length === 1) redirect(`/projects/${encodeURIComponent(project.id)}/article?outputId=${encodeURIComponent(articles[0]!.id)}`);
  const scopeKey=session.ctx.groupId?`group:${session.ctx.groupId}`:`account:${session.ctx.accountId??"missing"}`;
  const selectedOutputId=requestedOutputId??articles[0]?.id;
  // 两个请求独立开始；正文首读和定位分别流到客户端，定位不阻塞已保存稿。
  const initialArticleRead:ArticleInitialRead|undefined=selectedOutputId?{
    scopeKey,projectId:project.id,outputId:selectedOutputId,
    result:scoped.getArticle({params:{outputId:selectedOutputId},query:undefined,body:undefined}).then(article=>({article}),()=>({error:'已保存文章暂未读取完成，请重新打开或刷新重试。'})),
  }:undefined;
  const brandProfileRead:ArticleBrandProfileRead={scopeKey,result:scoped.getPositioningCenter({params:undefined,query:undefined,body:undefined}).then(value=>{
    const positioning=value as unknown as {
      currentStatement: BrandStatementRow | null;
    };
    const brand=positioning.currentStatement?.masterSnapshot?positioning.currentStatement:null;
    return brand?{id:brand.id,versionNumber:brand.versionNumber,oneLiner:brand.oneLiner}:null;
  },()=>null)};
  return <ArticleWorkbench
    key={requestedOutputId ?? articles[0]?.id ?? "new"}
    projectId={project.id}
    projectTitle={project.title}
    accountId={session.ctx.groupId?null:session.ctx.accountId}
    initialOutputs={articles}
    initialOutputId={selectedOutputId}
    initialArticleRead={initialArticleRead}
    brandProfileRead={brandProfileRead}
  />;
}
