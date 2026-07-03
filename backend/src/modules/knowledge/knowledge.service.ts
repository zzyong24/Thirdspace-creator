import type { RequestContext } from "@creatoros/contract";
import type {
  KnowledgeRepository,
  KnowledgeItemWithStats,
  KnowledgeRevisionRow,
  KnowledgeRelationRow,
} from "./knowledge.repository";
import { InvalidTransitionError, ConflictError } from "./knowledge.errors";

// [T-092] 从 sourceMetadata 提取评论幂等锚(signalExternalIds 字符串数组;
// 缺失/形状不符 → [],创建按普通路径走)。
function extractSignalExternalIds(
  sourceMetadata: Record<string, unknown> | undefined,
): string[] {
  const raw = sourceMetadata?.signalExternalIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );
}

// Knowledge service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into the user-scoped repository (foundation §2). It applies the
// §12 invariants (the plan's two, since SPEC §12 defines NO transition diagram
// for Knowledge):
//   1. items are born `status:'active'` (repo stamps it; one-way → archived, but
//      no archive op is in this wave's surface).
//   2. KnowledgeRevision is append-only/immutable: the repo allocates max+1 and
//      repoints currentRevisionId; the service ASSERTS the result number is
//      strictly increasing (defence-in-depth over the repo's numbering).
//   3. relations reject self-link + require both ends owned (repo enforces;
//      surfaced unswallowed so the dispatch route maps Conflict→409, Ownership→404).
// No cross-module repo import.

export interface KnowledgeService {
  // [T-079a] 读路径带战绩投影(usedCount/usedInPublished,repo 一次算齐)。
  listKnowledge(ctx: RequestContext): Promise<KnowledgeItemWithStats[]>;
  getKnowledge(
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<KnowledgeItemWithStats>;
  listRevisions(
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<KnowledgeRevisionRow[]>;
  listRelations(
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<KnowledgeRelationRow[]>;
  // [T-091] 图谱全量语义边(user-scoped 单查询,画全图不 N+1)。
  listAllRelations(ctx: RequestContext): Promise<KnowledgeRelationRow[]>;
  createKnowledge(
    ctx: RequestContext,
    input: {
      title: string;
      knowledgeType?: string;
      content?: string;
      // [T-079a] 可选出处(SPEC §1)。
      sourceNote?: string | null;
      // [T-092] 评论回流来源声明 + 溯源/幂等锚。
      sourceType?: string;
      sourceMetadata?: Record<string, unknown>;
    },
  ): Promise<KnowledgeItemWithStats>;
  createRevision(
    ctx: RequestContext,
    knowledgeId: string,
    input: { content: string },
  ): Promise<KnowledgeRevisionRow>;
  createRelation(
    ctx: RequestContext,
    knowledgeId: string,
    input: {
      targetKnowledgeId: string;
      relationType: string;
      // [T-091] AI 建边 provenance(确认门采纳传 'ai');缺省 'user'。
      createdByType?: "user" | "ai";
    },
  ): Promise<KnowledgeRelationRow>;
  archiveKnowledge(
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<KnowledgeItemWithStats>;
  removeRelation(
    ctx: RequestContext,
    knowledgeId: string,
    input: { targetKnowledgeId: string; relationType: string },
  ): Promise<KnowledgeRelationRow>;
}

export function createKnowledgeService(
  repo: KnowledgeRepository,
): KnowledgeService {
  return {
    async listKnowledge(ctx) {
      return repo.list(ctx.userId);
    },

    async getKnowledge(ctx, knowledgeId) {
      return repo.get(ctx.userId, knowledgeId);
    },

    async listRevisions(ctx, knowledgeId) {
      // Read op: the parent's ownership gate lives in the repo (404 on a
      // cross-user / unknown id). Returns newest-first so the head revision
      // (with the current content) is rows[0].
      return repo.listRevisions(ctx.userId, knowledgeId);
    },

    async listRelations(ctx, knowledgeId) {
      // Read op: relations of the (owned) source item; repo gates ownership.
      return repo.listRelations(ctx.userId, knowledgeId);
    },

    async listAllRelations(ctx) {
      // [T-091] 全量边读:所有权由 repo 的 source 端 join 收窄。
      return repo.listAllRelations(ctx.userId);
    },

    async createKnowledge(ctx, input) {
      // [T-092] 回流层幂等(并发兜底):携 signalExternalIds 的 qa 创建,采纳前
      // 再校验一次已回流锚集合——任一锚已入库即拒(同义合并组任一评论已回流 =
      // 整组视为已回流,SPEC §2.3),ConflictError → 409,确认门标注「已入库」跳过。
      const anchors = extractSignalExternalIds(input.sourceMetadata);
      if (anchors.length > 0) {
        const backflowed = await repo.listBackflowedSignalExternalIds(
          ctx.userId,
        );
        const hit = anchors.find((anchor) => backflowed.has(anchor));
        if (hit) {
          throw new ConflictError(
            `评论已回流过知识库(锚 ${hit}),不重复入库`,
          );
        }
      }
      // Items are born active with revision #1 (repo owns the UoW + stamps).
      return repo.create(ctx.userId, input);
    },

    async createRevision(ctx, knowledgeId, input) {
      // Read the current head number before appending so we can assert the new
      // revision strictly increases it (append-only invariant, defence-in-depth).
      const before = await repo.get(ctx.userId, knowledgeId);
      const head = await repo.getRevision(ctx.userId, before.currentRevisionId);
      const rev = await repo.createRevision(ctx.userId, knowledgeId, input);
      if (rev.revisionNumber <= head.revisionNumber) {
        throw new Error(
          `Revision numbering must strictly increase (got ${rev.revisionNumber} after ${head.revisionNumber})`,
        );
      }
      return rev;
    },

    async createRelation(ctx, knowledgeId, input) {
      // Self-link + cross-user ownership are enforced by the repo; surface
      // unswallowed (Conflict→409, Ownership→404 at the dispatch route).
      return repo.createRelation(ctx.userId, knowledgeId, input);
    },

    async archiveKnowledge(ctx, knowledgeId) {
      // §12-style one-way soft-delete: active → archived (mirrors
      // assets.trashAsset). The service owns the transition guard — archiving an
      // already-archived item is an InvalidTransitionError (→409); the repo only
      // gates ownership + stamps the new status/archivedAt.
      const item = await repo.get(ctx.userId, knowledgeId);
      if (item.status !== "active") {
        throw new InvalidTransitionError(
          `Cannot archive a knowledge item in status '${item.status}'`,
        );
      }
      return repo.archive(ctx.userId, knowledgeId);
    },

    async removeRelation(ctx, knowledgeId, input) {
      // Drop one outgoing relation off the (owned) source item. Ownership of the
      // source + existence of the relation are enforced by the repo (a missing
      // relation → OwnershipError → 404, no existence leak).
      return repo.removeRelation(ctx.userId, knowledgeId, input);
    },
  };
}
