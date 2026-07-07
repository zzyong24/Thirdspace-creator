import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, CommentQaSiftOutput } from "@creatoros/ai-worker";

// 评论回流蒸馏筛 runner(comment.qa-sift,T-092 SPEC §2.1 ②)—— 三级去噪门的 AI 层。
// 输入 = 硬规则预筛后的评论批(signalId+rawText+likeCount),同步跑一次结构化节点,
// 产 qa 原子候选 `{ candidates: [{title,note,sourceNote,signalIds}] }`,由
// /api/knowledge/comment-sift 路由返回给前端渲**回流确认门**(可勾选/改 title/改 note),
// 人点「采纳选中 N 条」才逐条 knowledge.create(type='qa')物化 —— AI 只产候选铁律。
//
// 空候选是合法结果(评论全是夸赞/水贴就空,不编问题);凭据/模型失败直接抛错。
// 模型按 capability "comment.qa-sift" 经 model-config 解析(可配铁律,不写死)。

export interface CommentQaSiftDeps {
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

/** 送入模板的评论投影(预筛后)。 */
export interface SiftCommentInput {
  signalId: string;
  rawText: string;
  likeCount: number | null;
}

/** 归一后的 qa 候选 —— 确认门每行卡的渲染形状。 */
export interface QaCandidate {
  title: string;
  note: string;
  sourceNote: string;
  signalIds: string[];
}

// 送模型的评论批上限(条)—— 与 SPEC §2.1 ① 的 top 200 对齐;单条文本截 200 字防爆。
export const MAX_SIFT_COMMENTS = 200;

/** 把评论批拼成模板 facet(每行 `[signalId] (赞 N) 原文`)。 */
export function buildCommentsFacet(
  comments: ReadonlyArray<SiftCommentInput>,
): string {
  return comments
    .slice(0, MAX_SIFT_COMMENTS)
    .map(
      (c) =>
        `[${c.signalId}] (赞 ${c.likeCount ?? 0}) ${c.rawText.trim().slice(0, 200)}`,
    )
    .join("\n");
}

/**
 * 归一 schema 校验过的输出:
 *   - title 空的滤掉(没有问题本体的候选不进门);title 截 80;
 *   - signalIds 只保留真实存在于输入批的 id;滤后为空的候选整条丢(没有支撑评论 = 编造);
 *   - sourceNote 空则按支撑评论自动拼(「抖音评论 ×N,最高赞 M」)。
 * 空数组是诚实结果(不抛错)。
 */
export function normalizeQaCandidates(
  o: CommentQaSiftOutput,
  comments: ReadonlyArray<SiftCommentInput>,
): QaCandidate[] {
  const byId = new Map(
    comments.slice(0, MAX_SIFT_COMMENTS).map((c) => [c.signalId, c]),
  );
  const out: QaCandidate[] = [];
  for (const c of o.candidates) {
    const title = c.title.trim().slice(0, 80);
    if (!title) continue;
    const signalIds = Array.from(
      new Set(c.signalIds.map((s) => s.trim()).filter((s) => byId.has(s))),
    );
    if (signalIds.length === 0) continue; // 无真实支撑评论 = 编造,丢
    let sourceNote = c.sourceNote.trim();
    if (!sourceNote) {
      const topLike = Math.max(
        ...signalIds.map((s) => byId.get(s)?.likeCount ?? 0),
      );
      sourceNote =
        signalIds.length > 1
          ? `抖音评论 ×${signalIds.length},最高赞 ${topLike}`
          : `抖音评论,赞 ${topLike}`;
    }
    out.push({ title, note: c.note.trim(), sourceNote, signalIds });
  }
  return out;
}

/**
 * 跑一次 comment.qa-sift —— resolveModelSpec("comment.qa-sift") + runStructuredNode。
 * 空输入直接诚实返回空(不打模型)。
 */
export async function runCommentQaSift(
  ctx: RequestContext,
  input: { comments: ReadonlyArray<SiftCommentInput> },
  deps: CommentQaSiftDeps,
): Promise<{ candidates: QaCandidate[] }> {
  const comments = input.comments.filter(
    (c) => c.signalId.trim() && c.rawText.trim(),
  );
  if (comments.length === 0) {
    return { candidates: [] };
  }
  const spec = await deps.resolveModelSpec(ctx, "comment.qa-sift");
  const { modelFor, runStructuredNode, getTemplate } =
    await import("@creatoros/ai-worker");
  const { object } = await runStructuredNode<CommentQaSiftOutput>({
    model: modelFor(spec),
    template: getTemplate("comment.qa-sift"),
    facets: { comments: buildCommentsFacet(comments) },
  });
  return { candidates: normalizeQaCandidates(object, comments) };
}
