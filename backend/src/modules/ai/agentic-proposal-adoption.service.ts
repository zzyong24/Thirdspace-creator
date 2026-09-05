import { and, eq, aiTasks, aiTaskResults, requireAccountId, type Db } from "@creatoros/backend";
import { agenticProposal, type KnowledgeProposal, type AssetTagProposal, type RequestContext } from "@creatoros/contract";
import { ConflictError, OwnershipError } from "./ai.errors";

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export interface AgenticProposalAdoptionPorts {
  knowledge(ctx: RequestContext, proposal: KnowledgeProposal, tx: Transaction): Promise<unknown>;
  assetTagsBatch(ctx: RequestContext, proposals: AssetTagProposal[], tx: Transaction): Promise<Array<{ proposalId: string }>>;
}

/** 候选确认与取消争用同一AI任务锁，领域端口在该事务中执行，不能分离终态。 */
export function createAgenticProposalAdoptionService(db: Db, ports: AgenticProposalAdoptionPorts, now = () => new Date().toISOString()) {
  return {
    async confirmTask(ctx: RequestContext, taskId: string): Promise<void> {
      const accountId = requireAccountId(ctx.accountId, "ai.confirmAgenticProposals");
      await db.transaction(async tx => {
        const [task] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, ctx.userId), eq(aiTasks.accountId, accountId))).for("update");
        if (!task) throw new OwnershipError("候选任务不存在");
        if (task.status === "succeeded") return;
        if (task.status !== "awaiting_confirmation") throw new ConflictError("候选任务当前不可采纳");
        const candidates = await tx.select().from(aiTaskResults).where(and(eq(aiTaskResults.aiTaskId, taskId), eq(aiTaskResults.resultType, "agentic_proposals")));
        if (candidates.length !== 1) throw new ConflictError("候选批次不唯一，请重新生成候选");
        const raw = (candidates[0]!.resultData as { proposals?: unknown }).proposals;
        if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) throw new ConflictError("缺少可采纳的业务候选");
        const proposals = raw.map(value => agenticProposal.parse(value));
        if (new Set(proposals.map(p => p.proposalId)).size !== proposals.length || proposals.some(p => p.source.taskId !== taskId)) {
          throw new ConflictError("候选来源不属于当前任务或候选编号重复");
        }
        // 保持稳定采纳顺序；数据库冲突会回滚整批。
        const sorted = [...proposals].sort((a, b) => a.kind.localeCompare(b.kind) || a.proposalId.localeCompare(b.proposalId));
        const receipts: Array<{ proposalId: string; result: unknown }> = [];
        const material = sorted.filter((p): p is AssetTagProposal => p.kind === "asset.tags");
        if (material.length) {
          const adopted = await ports.assetTagsBatch(ctx, material, tx);
          receipts.push(...adopted.map(result => ({ proposalId: result.proposalId, result })));
        }
        for (const proposal of sorted) {
          if (proposal.kind !== "knowledge.create") continue;
          receipts.push({ proposalId: proposal.proposalId, result: await ports.knowledge(ctx, proposal, tx) });
        }
        await tx.update(aiTaskResults).set({ resultData: { ...candidates[0]!.resultData as object, adoptionReceipts: receipts } }).where(eq(aiTaskResults.id, candidates[0]!.id));
        await tx.update(aiTasks).set({ status: "succeeded", completedAt: now() }).where(eq(aiTasks.id, taskId));
      });
    },
  };
}
