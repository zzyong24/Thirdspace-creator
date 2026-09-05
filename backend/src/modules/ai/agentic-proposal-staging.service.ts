import { createHash } from "node:crypto";
import { and, eq, aiTasks, aiTaskResults, requireAccountId, type Db } from "@creatoros/backend";
import { agenticProposal, type AgenticProposal, type RequestContext } from "@creatoros/contract";
import { prepareKnowledgeProposal } from "../knowledge";
import { ConflictError, OwnershipError } from "./ai.errors";

type Input = { toolCallId: string; evidenceRefs: string[] } & (
  | { kind: "knowledge.create"; title: string; note: string; sourceNote: string }
  | { kind: "asset.tags"; assetIds: string[]; tag: string }
);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createAgenticProposalStagingService(db: Db, ports: {
  resolveLease(ctx: RequestContext, taskId: string): { leaseToken: string };
  now?: () => string;
  prepareAssets(ctx: RequestContext, ids: string[]): Promise<Array<{ assetId: string; expectedVersion: string }>>;
}) {
  return {
    async stage(ctx: RequestContext, taskId: string, input: Input, signal: AbortSignal): Promise<AgenticProposal> {
      signal.throwIfAborted();
      const accountId = requireAccountId(ctx.accountId, "ai.stageAgenticProposal");
      if (!input.toolCallId || !input.evidenceRefs.length) throw new ConflictError("候选缺少真实调用或来源证据");
      const lease = ports.resolveLease(ctx, taskId);
      const now = ports.now ?? (() => new Date().toISOString());
      const proposalId = `proposal:${hash([taskId, input.toolCallId])}`;
      const requestDigest = hash(input);
      const source = { taskId, toolCallId: input.toolCallId, evidenceRefs: input.evidenceRefs };
      const read = async () => {
        const [task] = await db.select().from(aiTasks).where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, ctx.userId), eq(aiTasks.accountId, accountId)));
        if (!task) throw new OwnershipError("自主任务不存在");
        if (task.status !== "running" || task.executionTaskId || task.leaseToken !== lease.leaseToken || !task.leaseExpiresAt || task.leaseExpiresAt <= now()) throw new ConflictError("当前执行权不允许该入口生成候选");
        const [existing] = await db.select().from(aiTaskResults).where(eq(aiTaskResults.id, proposalId));
        return existing;
      };
      const replay = (row: typeof aiTaskResults.$inferSelect) => {
        const data = row.resultData as { requestDigest?: string; proposal?: unknown };
        if (row.aiTaskId !== taskId || data.requestDigest !== requestDigest) throw new ConflictError("同一工具调用已绑定不同候选内容");
        return agenticProposal.parse(data.proposal);
      };
      const prior = await read();
      if (prior) return replay(prior);
      const proposal = input.kind === "knowledge.create"
        ? prepareKnowledgeProposal(ctx, { proposalId, source, title: input.title, note: input.note, sourceNote: input.sourceNote })
        : agenticProposal.parse({ schemaVersion: 1, kind: "asset.tags", proposalId, source,
          targets: await ports.prepareAssets(ctx, input.assetIds), tag: input.tag });
      return db.transaction(async tx => {
        const [task] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, ctx.userId), eq(aiTasks.accountId, accountId))).for("update");
        signal.throwIfAborted();
        if (!task || task.status !== "running" || task.executionTaskId || task.leaseToken !== lease.leaseToken || !task.leaseExpiresAt || task.leaseExpiresAt <= now()) throw new ConflictError("任务已停止或执行权已转交，不能写候选");
        const [created] = await tx.insert(aiTaskResults).values({ id: proposalId, aiTaskId: taskId,
          resultType: "agentic_proposal_staged", resultData: { requestDigest, proposal },
        }).onConflictDoNothing().returning();
        if (created) return proposal;
        const [existing] = await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id, proposalId));
        if (!existing) throw new ConflictError("候选保存回执缺失");
        return replay(existing);
      });
    },
  };
}
