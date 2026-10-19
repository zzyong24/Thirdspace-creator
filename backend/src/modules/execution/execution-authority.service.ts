import {frozenExecutionRoute} from '@creatoros/contract/execution-worker';
import {PRIVATE_COLLECTION_SOURCE_KINDS,assertPrivateCollectorJob} from '../scheduling';
import {requireWorkspace} from "../../workspace-scope";
import {assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {workspaceFilter} from "../../workspace-scope";
import {executionBudgetSchema, executionBudgetDeadline, newExecutionBudgetDeadline} from "@creatoros/contract/execution-worker";
import { assertFrozenBrowserTaskGrant } from "./browser-task-grant";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { workerTaskInputSchema } from "@creatoros/contract/execution-worker";
import { randomUUID } from "node:crypto";
import { and, eq, aiTasks, executionTasks, executionCalls, OwnershipError, requireAccountId, type Db } from "@creatoros/backend";
import {canvasProposalAdmissionSchema,type RequestContext} from "@creatoros/contract";
import {chatWorkerInputSchema,chatToolProviderName,workerToolResultReceiptSchema,agenticToolOutcomeSchema,chatSubmittedTaskType,chatSubmittedTaskResultKind} from "@creatoros/contract/execution-worker";
import { ConflictError } from "./execution.errors";

const preparedExecutionSchema = z.object({
  requestFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  modelInput: workerTaskInputSchema,
  budget: executionBudgetSchema,
  priority: z.number().int().min(0).max(100).optional(),
  /** 仅可信宿主已核原提交/确认事实使用；不属于公开请求字段。 */
  inheritedDeadline:z.literal(true).optional(),
}).strict();
export type PreparedModelExecution = z.infer<typeof preparedExecutionSchema>;

const submittedOriginSchema=z.object({executionTaskId:z.string(),callId:z.string(),inputDigest:z.string()}).strict();
const preparedDeadlineSchema=z.object({deadlineAt:z.string().datetime().nullable()}).passthrough();
/** SEMANTIC_BOUNDARY_ALLOW: 按真实已提交来源、租约代数与冻结预算核绝对期限，不判断创作内容。 */
async function verifiedInheritedDeadline(tx:Db,task:typeof aiTasks.$inferSelect,prepared:PreparedModelExecution):Promise<string|null>{
 const runtime=(task.runtimeData??{}) as Record<string,unknown>,input=(task.inputData??{}) as Record<string,unknown>;
 const deadlineAt=executionBudgetDeadline(prepared.budget,task.requestedAt);
 if(runtime.hostTaskSubmission!==undefined){
  const origin=submittedOriginSchema.parse(runtime.hostTaskSubmission);
  const [parent]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,origin.executionTaskId),eq(executionTasks.userId,task.userId),workspaceFilter(executionTasks,task)));
  const [business]=parent?await tx.select().from(aiTasks).where(and(eq(aiTasks.id,parent.ownerId),eq(aiTasks.executionTaskId,parent.id),eq(aiTasks.userId,task.userId),workspaceFilter(aiTasks,task))):[];
  const [call]=parent?await tx.select().from(executionCalls).where(and(eq(executionCalls.id,origin.callId),eq(executionCalls.executionTaskId,parent.id))):[];
  // settled回执原子提交时已由withLease核原fence；恢复核其真实startedAttempt，不要求已结束父任务仍持有活租约。
  if(!parent||parent.kind!=="ai_task"||parent.ownerType!=="ai_task"||business?.taskType!=="copilot.assist"||!call||call.kind!=="tool"||call.parentCallId||call.status!=="settled"||call.inputDigest!==origin.inputDigest||call.startedAttempt===null||call.startedAttempt<1||call.startedAttempt>parent.attempt||task.attemptId!==`chat-submit:${call.id}`)throw new ConflictError("继承期限缺少原已确认提交");
  const frozen=chatWorkerInputSchema.parse((parent.payload as {modelInput?:unknown}).modelInput);
  const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText??"")),outcome=agenticToolOutcomeSchema.parse(receipt.output),data=outcome.data as Record<string,unknown>|undefined;
  const definition=frozen.tools.find(tool=>chatSubmittedTaskType(tool.name)===task.taskType&&(tool.execution==="host.task-submit"||(tool.name==="script.draft"&&tool.execution==="worker.script-draft"))&&tool.effect==="committed");
  if(!definition||receipt.toolName!==chatToolProviderName(definition.name)||frozen.userId!==task.userId||frozen.accountId!==task.accountId||(frozen.groupId??null)!==task.groupId||outcome.status!=="ok"||outcome.sideEffect!=="committed"||outcome.error||data?.taskId!==task.id||data.kind!==chatSubmittedTaskResultKind(definition.name))throw new ConflictError("继承期限原任务回执不符");
  const preparation=preparedDeadlineSchema.parse(runtime.hostTaskPreparation),parentBudget=executionBudgetSchema.parse(parent.executionBudget);
  if(!("policy" in parentBudget)&&parent.deadlineAt===null)throw new ConflictError("有限父任务缺少原截止时间");
  const effective=parent.deadlineAt===null?preparation.deadlineAt:preparation.deadlineAt===null?parent.deadlineAt:new Date(Math.min(Date.parse(parent.deadlineAt),Date.parse(preparation.deadlineAt))).toISOString();
  const expected=executionBudgetSchema.parse({...parentBudget,deadlineMs:effective===null?null:Date.parse(effective)-Date.parse(task.requestedAt)});
  if(!isDeepStrictEqual(prepared.budget,expected)||deadlineAt!==effective)throw new ConflictError("继承期限与原父任务预算不符");
  return deadlineAt;
 }
 const owner=input.canvasOwner as {proposalAdmission?:unknown}|undefined;
 if(owner?.proposalAdmission!==undefined&&task.taskType==="asset.generate"&&prepared.modelInput.kind==="asset.generate"){
  // assetBusiness同一事务内已核原canvas reservation/确认事实；这里只精确核冻结deadline和限制。
  const admission=canvasProposalAdmissionSchema.parse(owner.proposalAdmission),expected={maxCalls:admission.assetLimit.maxCalls,maxTokens:admission.assetLimit.maxTokens,deadlineMs:Date.parse(admission.deadlineAt)-Date.parse(task.requestedAt)};
  if(!isDeepStrictEqual(prepared.budget,expected)||deadlineAt!==admission.deadlineAt)throw new ConflictError("继承期限与原画布确认不符");
  return deadlineAt;
 }
 throw new ConflictError("继承期限没有可信宿主来源");
}

/** 后端事务内转交执行权；业务 taskId 不变，Worker 不能指定归属或直接写库。 */
export function createExecutionAuthorityService(db: Db, deps: {now?: () => string} = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    async bindAiTask(ctx: RequestContext, aiTaskId: string, preparation?: PreparedModelExecution): Promise<{aiTaskId: string; executionTaskId: string}> {
      const prepared = preparation ? preparedExecutionSchema.parse(preparation) : undefined;
      requireWorkspace(ctx);
      return db.transaction(async tx => {
        const [task] = await tx.select().from(aiTasks).where(and(
          eq(aiTasks.id, aiTaskId), eq(aiTasks.userId, ctx.userId), workspaceFilter(aiTasks,ctx),
        )).for("update");
        if (!task) throw new OwnershipError("AI task not found");
        const collectorKind=task.taskType.startsWith("scheduled.")?task.taskType.slice(10):"";
        const jobId=(task.inputData as Record<string,unknown>)?.jobId;
        const privateAdmission=!!task.accountId&&!!task.groupId&&PRIVATE_COLLECTION_SOURCE_KINDS.has(collectorKind)&&typeof jobId==="string";
        await assertFrozenWorkspaceMembership(tx,{userId:task.userId,groupId:task.groupId,accountId:task.accountId,groupVersion:task.groupVersion,membershipVersion:task.membershipVersion},{allowArchived:privateAdmission});
        if(privateAdmission)await assertPrivateCollectorJob(tx as unknown as Db,{...ctx,groupId:task.groupId,accountId:task.accountId,membershipVersion:task.membershipVersion??undefined},jobId as string,collectorKind);
        if (prepared?.modelInput.kind === "model.structured" && (prepared.modelInput.skillSnapshot.userId !== task.userId || prepared.modelInput.skillSnapshot.accountId !== task.accountId || (prepared.modelInput.skillSnapshot.groupId??null)!==task.groupId)) throw new OwnershipError("Skill snapshot owner mismatch");
        if(task.taskType==="asset.asr"&&!prepared&&!task.executionTaskId)throw new ConflictError("资产ASR必须冻结原输入与预算后绑定");
        if(prepared?.modelInput.kind==="asset.asr"&&(task.taskType!=="asset.asr"||!isDeepStrictEqual(task.inputData,prepared.modelInput)))throw new ConflictError("资产ASR准备输入与原业务任务不符");
        if (prepared?.modelInput.kind === "model.structured" && (prepared.modelInput.skillSnapshot.userId !== task.userId || prepared.modelInput.skillSnapshot.accountId !== task.accountId)) throw new OwnershipError("Skill snapshot owner mismatch");
        if (prepared && prepared.requestFingerprint !== task.requestFingerprint) throw new ConflictError("准备输入与原任务指纹不符");
        const browserGrant = prepared?.modelInput.kind === "agentic.run" ? assertFrozenBrowserTaskGrant(task, prepared.modelInput.browserAuthorization) : null;
        if (task.executionTaskId) {
          const [execution] = await tx.select().from(executionTasks).where(and(
            eq(executionTasks.id, task.executionTaskId), eq(executionTasks.userId, task.userId),
            workspaceFilter(executionTasks,task), eq(executionTasks.ownerId, task.id),
            eq(executionTasks.ownerType, "ai_task"), eq(executionTasks.kind, "ai_task"),
          ));
          if (!execution) throw new ConflictError("任务执行映射不一致，请先核对");
          const originalRoute=frozenExecutionRoute(task.runtimeData);
          if(originalRoute.schemaVersion===2&&!isDeepStrictEqual((execution.payload as Record<string,unknown>).executionRoute,originalRoute))throw new ConflictError("已有执行的完整模型路由与原任务不符");
          if (prepared && (!isDeepStrictEqual((execution.payload as Record<string,unknown>).modelInput,prepared.modelInput) || !isDeepStrictEqual(execution.executionBudget,prepared.budget))) {
            throw new ConflictError("已有执行输入或预算不能改写");
          }
          return {aiTaskId: task.id, executionTaskId: execution.id};
        }
        // 已有提交事实或旧租约必须走专门对账，不能用迁移把未知提交变成重试。
        if (task.status !== "queued" || task.leaseOwner || task.leaseToken || task.modelCallStartedAt) {
          throw new ConflictError("仅未执行的排队任务可直接转交执行权");
        }
        const executionTaskId = `exec_${randomUUID()}`;
        const stamp = now();
        const deadlineAt=prepared?(prepared.inheritedDeadline?await verifiedInheritedDeadline(tx as unknown as Db,task,prepared):newExecutionBudgetDeadline(prepared.budget,browserGrant?.grantedAt??task.requestedAt)):null;
        if(prepared?.inheritedDeadline&&deadlineAt!==null&&Date.parse(deadlineAt)<=Date.parse(stamp))throw new ConflictError("原任务期限已耗尽，不能创建新执行");
        await tx.insert(executionTasks).values({
          id: executionTaskId, userId: task.userId, accountId: task.accountId,groupId:task.groupId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined,
          kind: "ai_task", ownerType: "ai_task", ownerId: task.id,
          idempotencyKey: `ai:${task.id}`, payload: {aiTaskId: task.id,executionRoute:frozenExecutionRoute(task.runtimeData), ...(prepared ? {modelInput:prepared.modelInput} : {})},
          ...(prepared ? {priority:prepared.priority??0,executionBudget:prepared.budget,deadlineAt} : {}),
          createdAt: stamp, updatedAt: stamp,
        });
        await tx.update(aiTasks).set({executionTaskId}).where(eq(aiTasks.id, task.id));
        return {aiTaskId: task.id, executionTaskId};
      });
    },
  };
}
