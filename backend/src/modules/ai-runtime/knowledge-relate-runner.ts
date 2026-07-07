import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, KnowledgeRelateOutput } from "@creatoros/ai-worker";

// 图谱 AI 建边 runner(knowledge.relate,T-091 SPEC §1.3)—— 复刻 distill runner 形态
// (同步请求/响应,无 ai_tasks 生命周期):输入知识原子清单,产候选语义边
// `{ candidates: [{sourceId,targetId,relationType,reason}] }`,由 /api/knowledge/relate
// 路由返回给前端渲**候选边确认门**(可勾选/改 relationType),人点「采纳选中 N 条」才逐条
// 走既有 knowledge.relations.create(createdByType='ai')—— AI 只产候选铁律。
//
// 空候选是合法结果(真没有语义关系就不硬凑,前端渲「AI 未发现可提议的关联」);
// 凭据/模型失败直接抛错,调用方内联展示,绝不静默兜底。
// 模型按 capability "knowledge.relate" 经 model-config 解析(可配铁律,不写死)。

export interface KnowledgeRelateDeps {
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

/** 送入模板的原子投影(id + type + title + sourceNote)。 */
export interface RelateAtomInput {
  id: string;
  knowledgeType: string;
  title: string;
  sourceNote: string | null;
}

/** 归一后的候选边 —— 确认门每行卡的渲染形状。 */
export interface RelateCandidate {
  sourceId: string;
  targetId: string;
  relationType: "supports" | "contradicts" | "references" | "extends";
  reason: string;
}

// 送模型的原子清单上限(条)—— 全库 <100 节点量级富余;超限截断防 prompt 爆。
export const MAX_RELATE_ATOMS = 120;

/** 把原子清单拼成模板 facet(每行 `[id] (type) title — sourceNote`)。 */
export function buildAtomsFacet(atoms: ReadonlyArray<RelateAtomInput>): string {
  return atoms
    .slice(0, MAX_RELATE_ATOMS)
    .map((a) => {
      const src = (a.sourceNote ?? "").trim();
      const title = a.title.trim().slice(0, 120);
      return `[${a.id}] (${a.knowledgeType}) ${title}${src ? ` — ${src.slice(0, 60)}` : ""}`;
    })
    .join("\n");
}

/**
 * 归一 schema 校验过的输出:
 *   - 两端 id 必须来自输入清单(模型编造的 id 滤掉);
 *   - 自连滤掉;reason 空的滤掉(没有依据的边不进确认门);
 *   - 同一对原子(无向)只留第一条(prompt 约束的兜底)。
 * 空数组是诚实结果(不抛错)。
 */
export function normalizeRelateCandidates(
  o: KnowledgeRelateOutput,
  knownIds: ReadonlySet<string>,
): RelateCandidate[] {
  const seenPairs = new Set<string>();
  const out: RelateCandidate[] = [];
  for (const c of o.candidates) {
    const sourceId = c.sourceId.trim();
    const targetId = c.targetId.trim();
    const reason = c.reason.trim().slice(0, 120);
    if (!sourceId || !targetId || sourceId === targetId) continue;
    if (!knownIds.has(sourceId) || !knownIds.has(targetId)) continue;
    if (!reason) continue;
    const pairKey = [sourceId, targetId].sort().join("::");
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    out.push({ sourceId, targetId, relationType: c.relationType, reason });
  }
  return out;
}

/**
 * 跑一次 knowledge.relate —— resolveModelSpec("knowledge.relate") + runStructuredNode
 * (外置模板 + outputSchema,registry 运行时取)。原子 <2 条时无边可提,直接诚实返回空。
 */
export async function runKnowledgeRelate(
  ctx: RequestContext,
  input: { atoms: ReadonlyArray<RelateAtomInput> },
  deps: KnowledgeRelateDeps,
): Promise<{ candidates: RelateCandidate[] }> {
  const atoms = input.atoms.filter((a) => a.id.trim() && a.title.trim());
  if (atoms.length < 2) {
    return { candidates: [] };
  }
  const spec = await deps.resolveModelSpec(ctx, "knowledge.relate");
  const { modelFor, runStructuredNode, getTemplate } =
    await import("@creatoros/ai-worker");
  const { object } = await runStructuredNode<KnowledgeRelateOutput>({
    model: modelFor(spec),
    template: getTemplate("knowledge.relate"),
    facets: { atoms: buildAtomsFacet(atoms) },
  });
  const knownIds = new Set(atoms.slice(0, MAX_RELATE_ATOMS).map((a) => a.id));
  return { candidates: normalizeRelateCandidates(object, knownIds) };
}
