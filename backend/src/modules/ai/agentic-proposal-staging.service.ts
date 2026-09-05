import { createHash } from "node:crypto";
import { and, eq, aiTasks, aiTaskResults, requireAccountId, type Db } from "@creatoros/backend";
import { agenticProposal, type AgenticProposal, type RequestContext } from "@creatoros/contract";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
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
  const leases = createExecutionLeaseService(db, { now: ports.now });
  return {
    /** 可信工具宿主传执行凭证；任务及用户归属只从持久执行行取得。 */
    async stageForExecution(ref: ExecutionRef, input: Input, signal: AbortSignal): Promise<AgenticProposal> {
      signal.throwIfAborted();
      if (!input.toolCallId || !input.evidenceRefs.length) throw new ConflictError("候选缺少真实调用或来源证据");
      const requestDigest = hash(input);
      const readScope = async (scope: Parameters<Parameters<typeof leases.withLease>[2]>[0]) => {
        const { tx, task, context } = scope;
        signal.throwIfAborted();
        if (task.kind !== "ai_task" || task.ownerType !== "ai_task") throw new ConflictError("当前执行没有AI业务任务");
        const accountId = requireAccountId(context.accountId, "ai.stageAgenticProposalForExecution");
        const [business] = await tx.select().from(aiTasks).where(and(
          eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id),
          eq(aiTasks.userId, context.userId), eq(aiTasks.accountId, accountId),
        )).for("update");
        if (!business || !["queued", "running"].includes(business.status)) throw new ConflictError("AI任务已停止或执行映射、归属不一致");
        const proposalId = `proposal:${hash([business.id, input.toolCallId])}`;
        const [existing] = await tx.select().from(aiTaskResults).where(eq(aiTaskResults.id, proposalId));
        if (existing) {
          const data = existing.resultData as { requestDigest?: string; proposal?: unknown };
          if (existing.aiTaskId !== business.id || data.requestDigest !== requestDigest) throw new ConflictError("同一工具调用已绑定不同候选内容");
          return { context, taskId: business.id, proposalId, prior: agenticProposal.parse(data.proposal) };
        }
        return { context, taskId: business.id, proposalId, prior: undefined };
      };
      const initial = await leases.withLease(ref, "admission", readScope);
      if (initial.prior) return initial.prior;
      const source = { taskId: initial.taskId, toolCallId: input.toolCallId, evidenceRefs: input.evidenceRefs };
      const proposal = input.kind === "knowledge.create"
        ? prepareKnowledgeProposal(initial.context, { proposalId: initial.proposalId, source, title: input.title, note: input.note, sourceNote: input.sourceNote })
        : agenticProposal.parse({ schemaVersion: 1, kind: "asset.tags", proposalId: initial.proposalId, source,
          targets: await ports.prepareAssets(initial.context, input.assetIds), tag: input.tag });
      return leases.withLease(ref, "admission", async scope => {
        const current = await readScope(scope);
        if (current.taskId !== initial.taskId || current.context.userId !== initial.context.userId || current.context.accountId !== initial.context.accountId) throw new ConflictError("准备期间任务归属已改变");
        if (current.prior) return current.prior;
        signal.throwIfAborted();
        await scope.tx.insert(aiTaskResults).values({ id: current.proposalId, aiTaskId: current.taskId,
          resultType: "agentic_proposal_staged", resultData: { requestDigest, proposal },
        });
        return proposal;
      });
    },
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
