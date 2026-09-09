import type { RequestContext } from "@creatoros/contract";

/** 仅解析真实归属 ID；批量服务端口继续执行 user/account 守卫。 */
export async function resolveImportedPublicationIdsInBatch(
  ctx: RequestContext,
  ports: {
    projects: {
      listImportedProjectIds(ctx: RequestContext): Promise<string[]>;
      listOutputRefsByProjects(ctx: RequestContext, ids: readonly string[]): Promise<Array<{ outputId: string }>>;
    };
    publishing: {
      listPublicationsByOutputIds(ctx: RequestContext, ids: readonly string[]): Promise<Array<{ id: string }>>;
    };
  },
): Promise<string[]> {
  const projects = await ports.projects.listImportedProjectIds(ctx);
  if (projects.length === 0) return [];
  const outputs = await ports.projects.listOutputRefsByProjects(ctx, projects);
  if (outputs.length === 0) return [];
  const publications = await ports.publishing.listPublicationsByOutputIds(
    ctx, outputs.map(output => output.outputId),
  );
  return [...new Set(publications.map(publication => publication.id))];
}
