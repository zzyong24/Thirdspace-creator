import {workspaceFilter} from "../../workspace-scope";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {eq,and,aiTasks,aiTaskSteps,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {videoFrozenSchema,structuredGenerationInputSchema,workerPortInputSchemas,workerStructuredResultSchema,type ExecutionRef,type WorkerPort} from "@creatoros/contract/execution-worker";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {prepareExecutionModelIdentity} from "./execution-model-identity.service";
import {ConflictError} from "./execution.errors";
const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** 视频只读项目快照、每Skill模型身份、原调用预算与结果均绑定同一业务执行。 */
export function createExecutionVideoService(db:Db,deps:Parameters<typeof createExecutionCallLedgerService>[1]&{resolveModelSpec(ctx:RequestContext,skillId:string):Promise<unknown>}){
 const leases=createExecutionLeaseService(db,deps),ledger=createExecutionCallLedgerService(db,deps);
 const access=<T>(ref:ExecutionRef,action:(scope:{input:ReturnType<typeof structuredGenerationInputSchema.parse>;frozen:ReturnType<typeof videoFrozenSchema.parse>;context:RequestContext})=>Promise<T>)=>leases.withLease(ref,"admission",async({tx,task,context})=>{
  const input=structuredGenerationInputSchema.parse((task.payload as {modelInput?:unknown}).modelInput),frozen=videoFrozenSchema.parse(JSON.parse(input.facets.__videoDecisions??"null"));
  const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
  if(task.kind!=="ai_task"||!business||business.taskType!=="video.decisions"||business.id!==frozen.task.id||business.projectId!==frozen.task.projectId||!isDeepStrictEqual(business.inputData,frozen.task.inputData))throw new ConflictError("视频任务与冻结来源不符");
  if(input.skillSnapshot.userId!==context.userId||input.skillSnapshot.accountId !== (context.accountId??null) || (input.skillSnapshot.groupId??null)!==(context.groupId??null))throw new ConflictError("视频Skill归属不符");
  return action({input,frozen,context});
 });
 return {async invoke(ref:ExecutionRef,port:WorkerPort,raw:unknown,signal?:AbortSignal):Promise<unknown>{
  signal?.throwIfAborted();
  if(port==="resolveVideoModel"){
   const {skillId}=workerPortInputSchemas.resolveVideoModel.parse(raw);
   const source=await access(ref,async scope=>scope);
   if(!source.frozen.modelIdentities[skillId])throw new ConflictError("原任务不需要此模型阶段");
   const {credential,identity}=prepareExecutionModelIdentity(skillId,await deps.resolveModelSpec(source.context,skillId));
   signal?.throwIfAborted();await access(ref,async({frozen})=>{if(!isDeepStrictEqual(frozen.modelIdentities[skillId],identity))throw new ConflictError("视频阶段模型配置与原任务不符");});return credential;
  }
  if(port==="reserveVideoModel"){
   const request=workerPortInputSchemas.reserveVideoModel.parse(raw),source=await access(ref,async scope=>scope);
   if(!source.frozen.modelIdentities[request.skillId])throw new ConflictError("视频阶段不在冻结范围");
   const prefix=`${source.input.operationKey}/video/${request.skillId}/`,suffix=request.operationKey.slice(prefix.length);
   if(!request.operationKey.startsWith(prefix)|| !/^[1-9][0-9]*\/model\/[1-9][0-9]*$/.test(suffix))throw new ConflictError("视频模型调用键不符");
   if(request.request.maxOutputTokens!==source.input.maxOutputTokens || "headers" in request.request || "abortSignal" in request.request)throw new ConflictError("视频模型预算不符");
   const encoded=JSON.stringify(request.request);if(encoded.length>4000000)throw new ConflictError("视频模型输入过大");
   const row=await ledger.reserve(ref,{operationKey:request.operationKey,kind:"model",inputDigest:`sha256:${hash(request.request)}`,reservedTokens:Buffer.byteLength(encoded)+1024+source.input.maxOutputTokens});
   return {callId:row.id,status:row.status,...(row.providerResult?{providerResult:row.providerResult}:{}),...(row.rejectionCode?{rejectionCode:row.rejectionCode}:{})};
  }
  if(port==="recordVideoStep" || port==="saveVideoCheckpoint"){
   const source=await access(ref,async scope=>scope);
   return leases.withLease(ref,"admission",async({tx,task})=>{
    const [business]=await tx.select().from(aiTasks).where(eq(aiTasks.id,task.ownerId)).for("update");if(!business||business.id!==source.frozen.task.id)throw new ConflictError("视频业务归属已变化");
    if(port==="recordVideoStep"){
     const step=workerPortInputSchemas.recordVideoStep.parse(raw),id=`video-step:${hash([task.id,step])}`;
     await tx.insert(aiTaskSteps).values({id,aiTaskId:business.id,...step,createdAt:deps.now?.()??new Date().toISOString()}).onConflictDoNothing();return {id};
    }
    const {checkpoint}=workerPortInputSchemas.saveVideoCheckpoint.parse(raw);
    if(checkpoint.schemaVersion!==1||typeof checkpoint.inputFingerprint!=="string"||!Array.isArray(checkpoint.scenes))throw new ConflictError("视频检查点无效");
    await tx.update(aiTasks).set({runtimeData:{...(business.runtimeData as Record<string,unknown>??{}),videoDecisionsCheckpoint:checkpoint}}).where(eq(aiTasks.id,business.id));return {};
   });
  }
  if(port==="saveVideoResult"){
   const {text}=workerPortInputSchemas.saveVideoResult.parse(raw);workerStructuredResultSchema.parse(JSON.parse(text));
   const source=await access(ref,async scope=>scope),state=await ledger.inspect(ref);
   if(state.calls.some(row=>!["settled","rejected"].includes(row.status)||(row.kind==="model"&&row.status==="settled"&&row.totalTokens===null)))throw new ConflictError("视频模型调用尚未确认");
   const row=await ledger.reserve(ref,{operationKey:`${source.input.operationKey}/video/result`,kind:"tool",inputDigest:`sha256:${hash(text)}`,reservedTokens:0});
   if(row.status==="reserved")await ledger.start(ref,row.id);
   const saved=await ledger.settle(ref,row.id,{status:"settled",usage:{totalTokens:0},resultText:text});return {callId:saved.id};
  }
  throw new ConflictError("视频执行端口不可用");
 }};
}
