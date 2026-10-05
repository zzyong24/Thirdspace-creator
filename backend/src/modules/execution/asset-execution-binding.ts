import {workspaceFilter} from "../../workspace-scope";
import {readCoverImageBinding} from "./cover-execution-binding";
import {createHash} from "node:crypto";
import {and,eq,aiTasks,executionCalls} from "@creatoros/backend";
import {assetGenerationInputSchema,providerJobSchema} from "@creatoros/contract/execution-worker";
import {canonicalJson} from "../ai/canonical-json";
import {createExecutionLeaseService} from "./execution-lease.service";
import {ConflictError} from "./execution.errors";
type AssetExecutionScope=Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>["withLease"]>[2]>[0];
export async function bindAssetExecution(scope:AssetExecutionScope,callId?:string){
  const {task,context,tx}=scope;
  const payload=task.payload as Record<string,unknown>;
  const cover=(payload.modelInput as {kind?:string;skillId?:string})?.kind==="model.structured"&&(payload.modelInput as {skillId?:string}).skillId==="cover.brief"?await readCoverImageBinding(scope):null;
  const input=cover?.input??assetGenerationInputSchema.parse(payload.modelInput);
  const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
  if(task.kind!=="ai_task" || task.ownerType!=="ai_task" || payload.aiTaskId!==business?.id || business?.taskType!==(cover?"cover.generate":"asset.generate"))throw new ConflictError("素材执行缺少真实任务归属");
  const businessInput=business.inputData as Record<string,unknown>;
  if(!cover && ((businessInput.kind==="video"?"video":"image")!==input.mediaKind || businessInput.prompt!==input.prompt))throw new ConflictError("素材执行输入与原业务任务不符");
  const name=cover&&typeof cover.resultData.name==="string"?cover.resultData.name:undefined;
  const digest=`sha256:${createHash("sha256").update(canonicalJson(input)).digest("hex")}`;
  const recovery=payload.assetLegacyRecovery as {mode?:string;callId?:string}|undefined;
  if(recovery&&recovery.mode!=="provider_job")throw new ConflictError("历史素材只允许读取原结果并核对");
  if(recovery&&callId!==undefined&&callId!==recovery.callId)throw new ConflictError("历史素材只能读取原导入调用");
  if(callId===undefined)return {input,digest,name,call:null,saved:null,legacyRecovery:false};
  const [call]=await tx.select().from(executionCalls).where(and(eq(executionCalls.id,callId),eq(executionCalls.executionTaskId,task.id)));

  if(!call || call.kind!=="model" || call.parentCallId || call.operationKey!==input.operationKey || call.inputDigest!==digest || call.toolExecutionClaimId)throw new ConflictError("素材执行与原调用不符");
  function identity(raw:unknown){
   const job=providerJobSchema.parse(raw);
   if(job.provider!==input.provider || job.model!==input.model || job.baseUrl!==input.baseUrl || job.serviceId!==input.serviceId)throw new ConflictError("供应商身份与冻结输入不符");
   return job;
  }
  const saved=call.providerJob===null?null:identity(call.providerJob);
  if(saved && input.mediaKind!=="video")throw new ConflictError("图片调用不能携带视频任务号");
  const legacyRecovery=!!(recovery&&recovery.mode==="provider_job"&&recovery.callId===call.id&&saved&&call.startedAttempt===null);
  if(saved && (!["started","unknown","settled"].includes(call.status) || (!call.startedAttempt&&!legacyRecovery)))throw new ConflictError("供应商任务号缺少实际启动事实");
  return {input,digest,name,call,identity,saved,legacyRecovery};
 }
