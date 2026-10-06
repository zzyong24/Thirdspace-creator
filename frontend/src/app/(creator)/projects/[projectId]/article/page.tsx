import { notFound, redirect } from "next/navigation";

import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { ArticleWorkbench } from "@/features/article/article-workbench";
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
  let brandStatement: BrandStatementRow | null = null;
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
  try {
    const positioning = await scoped.getPositioningCenter({ params: undefined, query: undefined, body: undefined }) as unknown as {
      currentStatement: BrandStatementRow | null;
    };
    brandStatement = positioning.currentStatement?.masterSnapshot ? positioning.currentStatement : null;
  } catch {
    // 定位中心暂不可读时，文章仍可使用中性方法创作。
  }
  return <ArticleWorkbench
    key={requestedOutputId ?? articles[0]?.id ?? "new"}
    projectId={project.id}
    projectTitle={project.title}
    accountId={session.ctx.groupId?null:session.ctx.accountId}
    initialOutputs={articles}
    initialOutputId={requestedOutputId ?? articles[0]?.id}
    activeBrandProfile={brandStatement ? { id: brandStatement.id, versionNumber: brandStatement.versionNumber,
      oneLiner: brandStatement.oneLiner } : null}
  />;
}
