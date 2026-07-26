import type { RequestContext } from "@creatoros/contract";

export interface RecentProjectSourceRow {
  id: string;
  title: string;
  currentStage: string;
  status: string;
  source: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface RecentProjectContextRow {
  id: string;
  title: string;
  stage: string;
  status: string;
  source: string;
  publishedAt: string | null;
}

export interface RecentProjectsContextPorts {
  listProjects(ctx: RequestContext): Promise<RecentProjectSourceRow[]>;
  listOutputRefsByProjects(
    ctx: RequestContext,
    projectIds: ReadonlyArray<string>,
  ): Promise<Array<{ projectId: string; outputId: string }>>;
  listPublicationsByOutputIds(
    ctx: RequestContext,
    outputIds: ReadonlyArray<string>,
  ): Promise<
    Array<{
      contentOutputId: string;
      status: string;
      publishedAt?: string | null;
    }>
  >;
}

/**
 * Copilot 的近期作品投影。Project 提供 source/lifecycle，Publishing 的账号窄读端口
 * 提供 canonical publishedAt；两类事实并存，互不推断。
 */
export async function listRecentProjectsWithPublicationFacts(
  ctx: RequestContext,
  opts: { limit: number; offset: number },
  ports: RecentProjectsContextPorts,
): Promise<{ rows: RecentProjectContextRow[]; total: number }> {
  const projects = await ports.listProjects(ctx);
  const sorted = [...projects].sort((a, b) =>
    (b.updatedAt ?? b.createdAt ?? "").localeCompare(
      a.updatedAt ?? a.createdAt ?? "",
    ),
  );
  const page = sorted.slice(opts.offset, opts.offset + opts.limit);
  let outputRefs: Array<{ projectId: string; outputId: string }> = [];
  let publications: Array<{
    contentOutputId: string;
    status: string;
    publishedAt?: string | null;
  }> = [];
  try {
    outputRefs = await ports.listOutputRefsByProjects(
      ctx,
      page.map((project) => project.id),
    );
    publications = await ports.listPublicationsByOutputIds(
      ctx,
      outputRefs.map((ref) => ref.outputId),
    );
  } catch {
    // Publishing 是发布事实唯一来源。批量窄读失败时整页诚实返回未知(null)，绝不从
    // project lifecycle（尤其 review）反推“未发布”或伪造时间。
  }

  const projectIdByOutputId = new Map(
    outputRefs.map((ref) => [ref.outputId, ref.projectId] as const),
  );
  const latestByProjectId = new Map<string, string>();
  for (const publication of publications) {
    if (
      publication.status !== "published" &&
      publication.status !== "removed"
    ) {
      continue;
    }
    if (!publication.publishedAt) continue;
    const projectId = projectIdByOutputId.get(publication.contentOutputId);
    if (!projectId) continue;
    const current = latestByProjectId.get(projectId);
    if (!current || publication.publishedAt.localeCompare(current) > 0) {
      latestByProjectId.set(projectId, publication.publishedAt);
    }
  }

  const rows = page.map((project): RecentProjectContextRow => {
    return {
      id: project.id,
      title: project.title,
      stage: project.currentStage,
      status: project.status,
      source: project.source,
      publishedAt: latestByProjectId.get(project.id) ?? null,
    };
  });
  return { rows, total: sorted.length };
}
