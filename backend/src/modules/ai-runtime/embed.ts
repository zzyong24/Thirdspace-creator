import type { ModelSpec } from "@creatoros/ai-worker";

// [T-163 Batch 4] 批量向量嵌入 —— 从 frontend persistence-client 提到 backend ai-runtime。
// embedMany(Vercel AI SDK)+ embeddingModelFor 用 embedding model key(spec.token),故属
// 「AI SDK + 模型 key」逻辑,不该住前端包(桌面化 T-147 护城河:key 不过客户端边界)。组合根
// 只按 embedding capability 解析 spec + 传入;anthropic 协议不支持 embedding 由 embeddingModelFor
// 诚实抛错(调用方 best-effort 吞,只丢索引增益)。
export async function runEmbedTexts(
  spec: ModelSpec,
  texts: string[],
): Promise<number[][]> {
  const { embeddingModelFor } = await import("@creatoros/ai-worker");
  const { embedMany } = await import("ai");
  const { embeddings } = await embedMany({
    model: embeddingModelFor(spec),
    values: texts,
  });
  return embeddings;
}
