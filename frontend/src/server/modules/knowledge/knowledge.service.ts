import type { RequestContext } from "@creatoros/contract";
import type {
  KnowledgeRepository,
  KnowledgeItemRow,
  KnowledgeRevisionRow,
  KnowledgeRelationRow,
} from "./knowledge.repository";

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
  listKnowledge(ctx: RequestContext): Promise<KnowledgeItemRow[]>;
  getKnowledge(
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<KnowledgeItemRow>;
  listRevisions(
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<KnowledgeRevisionRow[]>;
  listRelations(
    ctx: RequestContext,
    knowledgeId: string,
  ): Promise<KnowledgeRelationRow[]>;
  createKnowledge(
    ctx: RequestContext,
    input: { title: string; knowledgeType?: string; content?: string },
  ): Promise<KnowledgeItemRow>;
  createRevision(
    ctx: RequestContext,
    knowledgeId: string,
    input: { content: string },
  ): Promise<KnowledgeRevisionRow>;
  createRelation(
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

    async createKnowledge(ctx, input) {
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
  };
}
