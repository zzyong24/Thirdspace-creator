import {createHash} from "node:crypto";
import {and,eq,aiTasks,executionCalls} from "@creatoros/backend";
import {assetGenerationInputSchema,providerJobSchema} from "@creatoros/contract/execution-worker";
import {canonicalJson} from "../ai/canonical-json";
import {createExecutionLeaseService} from "./execution-lease.service";
import {ConflictError} from "./execution.errors";
type AssetExecutionScope=Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>["withLease"]>[2]>[0];
export async function bindAssetExecution(scope:AssetExecutionScope,callId?:string){
  const {task,context,tx}=scope;
  const payload=task.payload as Record<string,unknown>,input=assetGenerationInputSchema.parse(payload.modelInput);
  const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),eq(aiTasks.accountId,context.accountId!)));
  if(task.kind!=="ai_task" || task.ownerType!=="ai_task" || payload.aiTaskId!==business?.id || business?.taskType!=="asset.generate")throw new ConflictError("素材执行缺少真实任务归属");
  const businessInput=business.inputData as Record<string,unknown>;
  if((businessInput.kind==="video"?"video":"image")!==input.mediaKind || businessInput.prompt!==input.prompt)throw new ConflictError("素材执行输入与原业务任务不符");
  const digest=`sha256:${createHash("sha256").update(canonicalJson(input)).digest("hex")}`;
  if(callId===undefined)return {input,digest,call:null,saved:null};
  const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,callId),eq(executionCalls.executionTaskId,task.id)));

  if(!call || call.kind!=="model" || call.parentCallId || call.operationKey!==input.operationKey || call.inputDigest!==digest || call.toolExecutionClaimId)throw new ConflictError("素材执行与原调用不符");
  function identity(raw:unknown){
   const job=providerJobSchema.parse(raw);
   if(job.provider!==input.provider || job.model!==input.model || job.baseUrl!==input.baseUrl || job.serviceId!==input.serviceId)throw new ConflictError("供应商身份与冻结输入不符");
   return job;
  }
  const saved=call.providerJob===null?null:identity(call.providerJob);
  if(saved && input.mediaKind!=="video")throw new ConflictError("图片调用不能携带视频任务号");
  if(saved && (!["started","unknown","settled"].includes(call.status) || !call.startedAttempt))throw new ConflictError("供应商任务号缺少实际启动事实");
  return {input,digest,call,identity,saved};
 }
