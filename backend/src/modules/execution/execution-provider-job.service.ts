import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {and,eq,aiTasks,executionCalls,type Db} from "@creatoros/backend";
import {assetGenerationInputSchema,providerJobSchema,providerJobReadSchema,providerJobRecordSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {canonicalJson} from "../ai/canonical-json";
import {createExecutionLeaseService} from "./execution-lease.service";
import {ConflictError} from "./execution.errors";

/** 保存外部已提交事实，不创建调用、不清除 unknown，也不改变任务终态或预算。 */
export function createExecutionProviderJobService(db:Db,deps:{now?:()=>string}={}){
 const now=deps.now??(()=>new Date().toISOString()),leases=createExecutionLeaseService(db,{now});
 type Lease=Parameters<Parameters<typeof leases.withLease>[2]>[0];
 async function bound(scope:Lease,callId:string){
  const {task,context,tx}=scope;
  const payload=task.payload as Record<string,unknown>,input=assetGenerationInputSchema.parse(payload.modelInput);
  const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!)));
  if(task.kind!=="ai_task" || task.ownerType!=="ai_task" || payload.aiTaskId!==business?.id || business?.taskType!=="asset.generate" || input.mediaKind!=="video")throw new ConflictError("供应商任务号缺少真实视频任务归属");
  const businessInput=business.inputData as Record<string,unknown>;
  if(businessInput.kind!==input.mediaKind || businessInput.prompt!==input.prompt)throw new ConflictError("视频执行输入与原业务任务不符");
  const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,callId),eq(executionCalls.executionTaskId,task.id)));
  const digest=`sha256:${createHash("sha256").update(canonicalJson(input)).digest("hex")}`;
  if(!call || call.kind!=="model" || call.parentCallId || call.operationKey!==input.operationKey || call.inputDigest!==digest || call.toolExecutionClaimId)throw new ConflictError("供应商任务号与原调用不符");
  function identity(raw:unknown){
   const job=providerJobSchema.parse(raw);
   if(job.provider!==input.provider || job.model!==input.model || job.baseUrl!==input.baseUrl || job.serviceId!==input.serviceId)throw new ConflictError("供应商身份与冻结输入不符");
   return job;
  }
  const saved=call.providerJob===null?null:identity(call.providerJob);
  if(saved && (!["started","unknown","settled"].includes(call.status) || !call.startedAttempt))throw new ConflictError("供应商任务号缺少实际启动事实");
  return {call,identity,saved};
 }
 return {
  async record(ref:ExecutionRef,raw:unknown){
   const request=providerJobRecordSchema.parse(raw);
   return leases.withLease(ref,"settlement",async scope=>{
    const {call,identity,saved}=await bound(scope,request.callId),job=identity(request.job);
    if(saved){if(!isDeepStrictEqual(saved,job))throw new ConflictError("已提交的供应商任务号不能替换");return saved;}
    if(!["started","unknown"].includes(call.status) || call.startedAttempt!==ref.attempt)throw new ConflictError("未获当前启动权，不能补记供应商提交");
    await scope.tx.update(executionCalls).set({providerJob:job,updatedAt:now()}).where(eq(executionCalls.id,call.id));
    return job;
   });
  },
  async read(ref:ExecutionRef,raw:unknown){
   const {callId}=providerJobReadSchema.parse(raw);
   return leases.withLease(ref,"admission",async scope=>(await bound(scope,callId)).saved);
  },
 };
}
