import type { RequestContext } from "@creatoros/contract";

type Projects = Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>, "listOutputRefsByProjects">;
type Publishing = Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>, "listPublicationsByOutputIds" | "listCurrentRevisionSummariesByPublicationIds">;

/** 页面辅助展示读取；空集不访问服务，不跨请求缓存。 */
export async function readProjectListCoverIds(
  ctx: RequestContext,
  projectIds: readonly string[],
  ports: { projects: Projects; publishing: Publishing },
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = Object.fromEntries(projectIds.map(id => [id, null]));
  if (!projectIds.length) return result;
  const outputs = await ports.projects.listOutputRefsByProjects(ctx, projectIds);
  const projectByOutput = new Map(outputs.filter(o => Object.hasOwn(result, o.projectId)).map(o => [o.outputId, o.projectId]));
  if (!projectByOutput.size) return result;
  const publications = await ports.publishing.listPublicationsByOutputIds(ctx, [...projectByOutput.keys()]);
  const owned = publications.filter(p => projectByOutput.has(p.contentOutputId));
  if (!owned.length) return result;
  const summaries = await ports.publishing.listCurrentRevisionSummariesByPublicationIds(ctx, owned.map(p => p.id));
  const currentByPublication = new Map(summaries.map(s => [s.publicationId, s]));
  // SEMANTIC_BOUNDARY_ALLOW: 按记录创建时间及真实ID确定展示顺序，不判断内容质量或创作取舍。
  owned.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  for (const publication of owned) {
    const projectId = projectByOutput.get(publication.contentOutputId)!;
    const current = currentByPublication.get(publication.id);
    if (result[projectId] === null && current?.revisionId === publication.currentRevisionId && current.coverAssetId) {
      result[projectId] = current.coverAssetId;
    }
  }
  return result;
}
