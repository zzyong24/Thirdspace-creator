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

export interface ProjectSearchOptions {
  query?: string;
  publishedOnly?: boolean;
  orderBy?: "publishedAt" | "updatedAt";
  direction?: "asc" | "desc";
  limit: number;
  excludeProjectId?: string;
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
 * [T-691] 历史项目检索必须先在完整的 user-scoped 项目集合上关联真实发布事实，再过滤、排序、
 * 截断。不能复用“先按更新时间分页，再补发布时间”的近期列表，否则“前 3 期”会漏掉真正最近发布
 * 但近期未编辑的项目。
 */
export async function searchProjectsWithPublicationFacts(
  ctx: RequestContext,
  opts: ProjectSearchOptions,
  ports: RecentProjectsContextPorts,
): Promise<{ rows: RecentProjectContextRow[]; total: number }> {
  const projects = await ports.listProjects(ctx);
  const outputRefs = await ports.listOutputRefsByProjects(
    ctx,
    projects.map((project) => project.id),
  );
  const publications = await ports.listPublicationsByOutputIds(
    ctx,
    outputRefs.map((ref) => ref.outputId),
  );
  const projectIdByOutputId = new Map(
    outputRefs.map((ref) => [ref.outputId, ref.projectId] as const),
  );
  const latestPublishedAt = new Map<string, string>();
  for (const publication of publications) {
    if (
      (publication.status !== "published" && publication.status !== "removed") ||
      !publication.publishedAt
    ) {
      continue;
    }
    const projectId = projectIdByOutputId.get(publication.contentOutputId);
    if (!projectId) continue;
    const current = latestPublishedAt.get(projectId);
    if (!current || publication.publishedAt.localeCompare(current) > 0) {
      latestPublishedAt.set(projectId, publication.publishedAt);
    }
  }

  const q = opts.query?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const direction = opts.direction === "asc" ? 1 : -1;
  const orderBy = opts.orderBy ?? "publishedAt";
  const rows = projects
    .filter((project) => project.id !== opts.excludeProjectId)
    .map((project): RecentProjectContextRow & { updatedAt: string } => ({
      id: project.id,
      title: project.title,
      stage: project.currentStage,
      status: project.status,
      source: project.source,
      publishedAt: latestPublishedAt.get(project.id) ?? null,
      updatedAt: project.updatedAt ?? project.createdAt ?? "",
    }))
    .filter((project) => !q || project.title.toLocaleLowerCase("zh-CN").includes(q))
    .filter((project) => !opts.publishedOnly || Boolean(project.publishedAt))
    .sort((a, b) => {
      const av = orderBy === "publishedAt" ? (a.publishedAt ?? "") : a.updatedAt;
      const bv = orderBy === "publishedAt" ? (b.publishedAt ?? "") : b.updatedAt;
      return av.localeCompare(bv) * direction || a.id.localeCompare(b.id);
    });

  return {
    rows: rows.slice(0, Math.max(1, Math.min(opts.limit, 20))).map((project) => ({
      id: project.id,
      title: project.title,
      stage: project.stage,
      status: project.status,
      source: project.source,
      publishedAt: project.publishedAt,
    })),
    total: rows.length,
  };
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
