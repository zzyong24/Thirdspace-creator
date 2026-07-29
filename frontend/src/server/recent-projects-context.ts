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

export interface PositioningWorksContextPorts {
  listProjects(ctx: RequestContext): Promise<RecentProjectSourceRow[]>;
  listOutputRefsByProjects(
    ctx: RequestContext,
    projectIds: ReadonlyArray<string>,
  ): Promise<Array<{ projectId: string; outputId: string }>>;
  /** 兼容旧端口名；T-595 后返回的就是源边界归一后的公开作品域。 */
  listVisiblePublicationsByOutputIds(
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

/**
 * 定位生成专用的真实作品投影。只接 Publishing canonical 可见窄读返回的已发布事实，
 * 再按 publication.publishedAt 从新到旧排序后分页。没有 publishedAt 的旧行不从
 * Project lifecycle/updatedAt 猜测；发布事实不可读时诚实返回空。
 */
export async function listPositioningWorksWithPublicationFacts(
  ctx: RequestContext,
  opts: { limit: number; offset: number },
  ports: PositioningWorksContextPorts,
): Promise<{ rows: RecentProjectContextRow[]; total: number }> {
  const projects = await ports.listProjects(ctx);
  if (projects.length === 0) return { rows: [], total: 0 };

  let outputRefs: Array<{ projectId: string; outputId: string }>;
  let publications: Array<{
    contentOutputId: string;
    status: string;
    publishedAt?: string | null;
  }>;
  try {
    outputRefs = await ports.listOutputRefsByProjects(
      ctx,
      projects.map((project) => project.id),
    );
    publications = await ports.listVisiblePublicationsByOutputIds(
      ctx,
      outputRefs.map((ref) => ref.outputId),
    );
  } catch {
    return { rows: [], total: 0 };
  }

  const projectIdByOutputId = new Map(
    outputRefs.map((ref) => [ref.outputId, ref.projectId] as const),
  );
  const latestPublishedAtByProjectId = new Map<string, string>();
  for (const publication of publications) {
    if (publication.status !== "published" || !publication.publishedAt) {
      continue;
    }
    const projectId = projectIdByOutputId.get(publication.contentOutputId);
    if (!projectId) continue;
    const current = latestPublishedAtByProjectId.get(projectId);
    if (!current || publication.publishedAt.localeCompare(current) > 0) {
      latestPublishedAtByProjectId.set(projectId, publication.publishedAt);
    }
  }

  const sorted = projects
    .flatMap((project): RecentProjectContextRow[] => {
      const publishedAt = latestPublishedAtByProjectId.get(project.id);
      if (!publishedAt) return [];
      return [
        {
          id: project.id,
          title: project.title,
          stage: project.currentStage,
          status: project.status,
          source: project.source,
          publishedAt,
        },
      ];
    })
    .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));

  return {
    rows: sorted.slice(opts.offset, opts.offset + opts.limit),
    total: sorted.length,
  };
}
