import { client } from "@/lib/contract-client";

// [T-053 断点①] 脚本工作台 AI 起草的 artifact getOrCreate —— **只在用户点「帮我写
// 分镜脚本」时执行**(经 AdoptCandidateCard.prepareInput),页面 SSR 保持纯读。
// 真项目此前没有脚本 artifact 时 AI 岛整个不渲染(T-050 收掉 fixture 查表后暴露的
// 断点):现在无 artifact 也能起草,点开始才建。语义与读侧 resolveScriptArtifactIdFromDb
// 对齐:优先复用已有 分镜脚本(output_script),其次 主脚本(master_script),都没有才
// 创建 output_script(读写同一目标,起草完刷新即读回)。
export async function ensureScriptArtifact(
  projectId: string,
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
    stage: string;
  }>;
  const scriptArtifacts = rows.filter((a) => a.stage === "script");
  const existing =
    scriptArtifacts.find((a) => a.artifactType === "output_script") ??
    scriptArtifacts.find((a) => a.artifactType === "master_script");
  if (existing) return { artifactId: existing.id };
  const created = (await client.createArtifact({
    params: { projectId },
    query: undefined,
    body: { title: "分镜脚本", artifactType: "output_script", stage: "script" },
  })) as { id: string };
  return { artifactId: created.id };
}
