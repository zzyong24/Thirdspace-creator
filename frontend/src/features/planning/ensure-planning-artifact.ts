import { client } from "@/lib/contract-client";

// [T-049 B12] 策划三节点(论点树/内容合同/结构方案)的 artifact getOrCreate ——
// **只在用户点「开始起草」时执行**(经 AdoptCandidateCard.prepareInput),页面 SSR 保持
// 纯读:旧实现在页面加载时就建 artifact,浏览 46 个历史项目会被动铸一堆空实体(审计 B12)。
// 先重查一遍(别的入口/上次起草可能已建,防重复),没有才创建。
export async function ensurePlanningArtifact(
  projectId: string,
  artifactType: string,
  title: string,
  knownId: string | null,
): Promise<Record<string, unknown>> {
  if (knownId) return { artifactId: knownId };
  const listed = await client.listArtifacts({
    params: { projectId },
    query: { page: 1, pageSize: 200 },
    body: undefined,
  });
  const rows = (Array.isArray(listed) ? listed : []) as Array<{
    id: string;
    artifactType: string;
  }>;
  const existing = rows.find((a) => a.artifactType === artifactType);
  if (existing) return { artifactId: existing.id };
  const created = (await client.createArtifact({
    params: { projectId },
    query: undefined,
    body: { title, artifactType, stage: "planning" },
  })) as { id: string };
  return { artifactId: created.id };
}
