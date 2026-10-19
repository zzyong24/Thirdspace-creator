import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { and, asc, eq, aiTasks, aiTaskResults, executionCalls, executionTasks, requireAccountId, type Db } from "@creatoros/backend";
import { agenticProposal, type AgenticProposal, type RequestContext } from "@creatoros/contract";
import { checkpointToolCallSchema, workerProviderReceiptSchema, frozenExecutionEngine, type ExecutionRef } from "@creatoros/contract/execution-worker";
import {agenticToolOperationKey} from "../execution/agentic-tool-binding";
import { verifyReadEvidence } from "../execution/execution-research-evidence.service";
import {ConflictError as ExecutionConflictError} from "../execution/execution.errors";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { prepareKnowledgeProposal } from "../knowledge";
import { ConflictError, OwnershipError } from "./ai.errors";

type Input = { toolCallId: string; evidenceRefs: string[] } & (
  | { kind: "knowledge.create"; title: string; note: string; sourceNote: string }
  | { kind: "asset.tags"; assetIds: string[]; tag: string }
);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type KnowledgeInput = Extract<Input, { kind: "knowledge.create" }>;
const knowledgeParameters = z.object({ title: z.string().trim().min(1), note: z.string().trim().min(1), sourceNote: z.string(), evidenceRefs: z.array(z.string().min(1)).min(1) });

export class KnowledgeSourceError extends ConflictError {}

/** 只读核验：候选必须对应真实模型参数及此前已经结算的阅读，不是新写入端口。 */
export async function verifyExecutionKnowledgeSource(tx: Tx, executionTaskId: string, input: KnowledgeInput, requireCurrentModel = false) {
  const [task] = await tx.select().from(executionTasks).where(eq(executionTasks.id, executionTaskId));
  const frozen = z.object({ kind: z.literal("agentic.run"), tools: z.array(z.object({ name: z.string() })) }).parse((task?.payload as { modelInput?: unknown } | undefined)?.modelInput);
  if (frozen.tools.filter(tool => tool.name === "knowledge.write").length !== 1) throw new ConflictError("知识工具不在冻结执行范围");
  const models = await tx.select().from(executionCalls).where(and(eq(executionCalls.executionTaskId, executionTaskId), eq(executionCalls.kind, "model"))).orderBy(asc(executionCalls.sequence));
  const matching: Array<{ model: typeof executionCalls.$inferSelect; params: z.infer<typeof knowledgeParameters> }> = [];
  const native=frozenExecutionEngine(task?.payload)==='codex';
  const bindings=(task?.payload as {codexCalls?:Record<string,{threadId?:string;turnId?:string;tools?:Record<string,unknown>}>}|undefined)?.codexCalls;
  for (const model of models) {
    if(native){
      const binding=bindings?.[model.id],part=checkpointToolCallSchema.safeParse({type:'tool-call',...(binding?.tools?.[input.toolCallId] as object??{})});
      if(model.parentCallId||!['started','settled'].includes(model.status)||!binding?.threadId||!binding.turnId||!part.success)continue;
      if(part.data.toolCallId!==input.toolCallId||part.data.toolName!=='knowledge.write')throw new ConflictError('知识候选缺少正确的原生工具来源');
      if(model.status==='settled'){
        const receipt=workerProviderReceiptSchema.parse(model.providerResult),canonical=receipt.content.filter(raw=>checkpointToolCallSchema.safeParse(raw).data?.toolCallId===input.toolCallId);
        if(canonical.length!==1||!isDeepStrictEqual(checkpointToolCallSchema.parse(canonical[0]),part.data))throw new ConflictError('知识候选与已结算原生工具来源不符');
      }
      matching.push({model,params:knowledgeParameters.parse(JSON.parse(part.data.input))});
      continue;
    }
    if (model.status !== "settled" || !model.providerResult) continue;
    const receipt = workerProviderReceiptSchema.parse(model.providerResult);
    for (const raw of receipt.content) {
      const part = checkpointToolCallSchema.safeParse(raw);
      if (!part.success || part.data.toolCallId !== input.toolCallId) continue;
      if (part.data.toolName !== "knowledge.write" || receipt.finishReason.unified !== "tool-calls") throw new ConflictError("知识候选缺少正确的模型工具调用");
      matching.push({ model, params: knowledgeParameters.parse(JSON.parse(part.data.input)) });
    }
  }
  if (matching.length !== 1 || (requireCurrentModel && matching[0]!.model.id !== models.at(-1)?.id)) throw new ConflictError("知识候选缺少当前唯一的模型工具调用");
  const bound = matching[0]!;
  if (!isDeepStrictEqual(bound.params, knowledgeParameters.parse(input))) throw new KnowledgeSourceError("知识候选内容与模型工具参数不一致");
  let beforeSequence=bound.model.sequence;
  if(native){
    if(models.filter(model=>!model.parentCallId).length!==1)throw new ConflictError('原生知识回合不唯一');
    const tools=await tx.select().from(executionCalls).where(and(eq(executionCalls.executionTaskId,executionTaskId),eq(executionCalls.kind,'tool'),eq(executionCalls.operationKey,agenticToolOperationKey(bound.model.id,input.toolCallId))));
    const call=tools[0];
    if(tools.length!==1||!call||!['started','settled'].includes(call.status)||(!requireCurrentModel&&call.status!=='settled')||call.sequence<=bound.model.sequence)throw new ConflictError('原生知识候选缺少已获执行权的原工具');
    // SEMANTIC_BOUNDARY_ALLOW: 原生单回合内的阅读以具体知识工具账本顺序核验，不能引用之后或未结算的观察。
    beforeSequence=call.sequence;
  }
  const evidence = await verifyReadEvidence(tx, executionTaskId, input.evidenceRefs, beforeSequence).catch(error=>{
    if(error instanceof ExecutionConflictError)throw new KnowledgeSourceError("evidenceRefs必须引用本任务已完成阅读的证据ID");
    throw error;
  });
  if (!evidence.some(row => row.sourceUrl === input.sourceNote)) throw new KnowledgeSourceError("sourceNote必须是已阅读证据的来源URL");
  return evidence;
}
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
        requireWorkspace(context);const accountId=context.accountId??null;
        const [business] = await tx.select().from(aiTasks).where(and(
          eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id),
          eq(aiTasks.userId, context.userId), workspaceFilter(aiTasks,context),
        )).for("update");
        if (!business || !["queued", "running"].includes(business.status)) throw new ConflictError("AI任务已停止或执行映射、归属不一致");
        if (input.kind === "knowledge.create") await verifyExecutionKnowledgeSource(tx, task.id, input, true);
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
      requireWorkspace(ctx);const accountId=ctx.accountId??null;
      if (!input.toolCallId || !input.evidenceRefs.length) throw new ConflictError("候选缺少真实调用或来源证据");
      const lease = ports.resolveLease(ctx, taskId);
      const now = ports.now ?? (() => new Date().toISOString());
      const proposalId = `proposal:${hash([taskId, input.toolCallId])}`;
      const requestDigest = hash(input);
      const source = { taskId, toolCallId: input.toolCallId, evidenceRefs: input.evidenceRefs };
      const read = async () => {
        const [task] = await db.select().from(aiTasks).where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, ctx.userId), workspaceFilter(aiTasks,ctx)));
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
        const [task] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, taskId), eq(aiTasks.userId, ctx.userId), workspaceFilter(aiTasks,ctx))).for("update");
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
