import {lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import { createHash } from "node:crypto";
import { and, eq, knowledgeAdoptions, knowledgeItems, knowledgeRevisions, workspaceKey,workspaceStamp,workspaceFilter, type Db } from "@creatoros/backend";
import { knowledgeProposal, type KnowledgeProposal, type RequestContext } from "@creatoros/contract";
import { ConflictError } from "./knowledge.errors";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const scopeIntent=(ctx:RequestContext,proposalId:string)=>{const scope=workspaceKey(ctx);return scope.kind==="group"?[ctx.userId,"group",scope.id,proposalId]:[ctx.userId,scope.id,proposalId];};
const targetId = (ctx: RequestContext, proposalId: string) => `knowledge-proposal:${digest(scopeIntent(ctx,proposalId))}`;

/** 生成候选形状，不写知识条目；真实父任务、调用和证据引用由调用方绑定。 */
export function prepareKnowledgeProposal(ctx: RequestContext, input: {
  proposalId: string; source: KnowledgeProposal["source"]; title: string; note: string; sourceNote: string;
}): KnowledgeProposal {
  return knowledgeProposal.parse({ schemaVersion: 1, kind: "knowledge.create", proposalId: input.proposalId,
    source: input.source, target: { knowledgeId: targetId(ctx, input.proposalId), expectedVersion: null },
    content: { title: input.title, note: input.note, sourceNote: input.sourceNote },
  });
}

/** 仅供 backend 用户采纳路径调用。知识条目、首版及幂等回执在同一事务里产生。 */
export function createKnowledgeProposalAdoptionService(db: Db, now = () => new Date().toISOString()) {
  return {
    async adopt(ctx: RequestContext, input: KnowledgeProposal, transaction?: Parameters<Parameters<Db["transaction"]>[0]>[0]): Promise<{ knowledgeId: string; revisionId: string }> {
      const proposal = knowledgeProposal.parse(input);
      const scope=workspaceKey(ctx),scopeStamp=workspaceStamp(scope);
      if (proposal.target.knowledgeId !== targetId(ctx, proposal.proposalId)) throw new ConflictError("知识候选目标与当前归属不符");
      // SEMANTIC_BOUNDARY_ALLOW: 内容摘要仅用于不可变候选幂等校验，不做语义分类。
      const sourceDigest = digest(proposal);
      const id = `knowledge-adoption:${digest(scopeIntent(ctx,proposal.proposalId))}`;
      const operation = async (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => {
        await lockWorkspaceMembership(tx,{...ctx,...scopeStamp});
        const [reserved] = await tx.insert(knowledgeAdoptions).values({
          id, userId: ctx.userId, ...scopeStamp, proposalId: proposal.proposalId, sourceDigest, result: {}, createdAt: now(),
        }).onConflictDoNothing().returning();
        if (!reserved) {
          const [receipt] = await tx.select().from(knowledgeAdoptions).where(and(
            eq(knowledgeAdoptions.userId, ctx.userId), workspaceFilter(knowledgeAdoptions,scope), eq(knowledgeAdoptions.proposalId, proposal.proposalId),
          ));
          if (!receipt || receipt.sourceDigest !== sourceDigest) throw new ConflictError("同一知识候选内容已变化，请重新生成候选");
          const result = receipt.result as { knowledgeId?: unknown; revisionId?: unknown };
          if (typeof result.knowledgeId !== "string" || typeof result.revisionId !== "string") throw new ConflictError("知识采纳回执不完整");
          return { knowledgeId: result.knowledgeId, revisionId: result.revisionId };
        }
        const knowledgeId = proposal.target.knowledgeId;
        const revisionId = `${knowledgeId}:revision:1`;
        const stamp = now();
        const [created] = await tx.insert(knowledgeItems).values({
          id: knowledgeId, userId: ctx.userId, ...scopeStamp, currentRevisionId: revisionId,
          title: proposal.content.title, knowledgeType: "reference", sourceType: "import",
          sourceNote: proposal.content.sourceNote, sourceMetadata: { proposalId: proposal.proposalId, ...proposal.source },
          status: "active", createdAt: stamp, updatedAt: stamp,
        }).onConflictDoNothing().returning();
        if (!created) throw new ConflictError("知识候选目标已存在，不能覆盖当前内容");
        await tx.insert(knowledgeRevisions).values({ id: revisionId, knowledgeItemId: knowledgeId,
          revisionNumber: 1, content: proposal.content.note, structuredData: {}, createdAt: stamp });
        const result = { knowledgeId, revisionId };
        await tx.update(knowledgeAdoptions).set({ result }).where(eq(knowledgeAdoptions.id, id));
        return result;
      };
      return transaction ? operation(transaction) : db.transaction(operation);
    },
  };
}
