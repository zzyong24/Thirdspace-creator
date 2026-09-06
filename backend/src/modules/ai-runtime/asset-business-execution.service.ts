import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {and,asc,eq,isNull,sql,aiTasks,aiTaskResults,executionTasks,OwnershipError,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {assetGenerationInputSchema,assetCredentialSchema,assetRuntimeOptionsSchema} from "@creatoros/contract/execution-worker";
import {canonicalJson} from "../ai/canonical-json";
import {awaitPreparation} from "../execution/await-preparation";
import {createExecutionAuthorityService,type PreparedModelExecution} from "../execution/execution-authority.service";
import type {MultimodalSpec} from "./multimodal/resolve";
type Task=typeof aiTasks.$inferSelect;
type Preparation={legacy:true;executionTaskId?:never}|{legacy?:never;aiTaskId:string;executionTaskId:string};
function fields(task:Task){
 const raw=task.inputData as Record<string,unknown>,mediaKind=raw.kind==="video"?"video":"image";
 if(typeof raw.prompt!=="string" || !raw.prompt.trim())throw new Error("素材生成缺少描述");
 return {kind:"asset.generate" as const,operationKey:"asset.generate",mediaKind,capability:`${mediaKind}.generate`,prompt:raw.prompt,
  ...(typeof raw.aspectRatio==="string"?{aspectRatio:raw.aspectRatio}:{}),
  ...(mediaKind==="video"?{durationSec:typeof raw.durationSec==="number" && Number.isInteger(raw.durationSec)?raw.durationSec:6,resolution:raw.resolution==="2K"?"2K":"768P"}:{}),
 };
}
/** 只转交没有旧提交事实的新任务；旧调用不得借迁移获得新账本。 */
export function createAssetBusinessExecutionService(db:Db,deps:{budget:PreparedModelExecution["budget"];now?:()=>string;resolveSpec(ctx:RequestContext,capability:"image.generate"|"video.generate",taskId:string):Promise<MultimodalSpec>;assertProject(ctx:RequestContext,id:string):Promise<void>}){
 const controller=new AbortController();
 const authority=createExecutionAuthorityService(db,{now:deps.now});
 const owned=(ctx:RequestContext,id:string)=>and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,ctx.accountId??""));
 async function hasLegacy(tx:Pick<Db,"select">,task:Task){
  if(task.retryOfTaskId || Object.prototype.hasOwnProperty.call(task.runtimeData??{},"multimodalProviderCheckpoint"))return true;
  return !!(await tx.select({id:aiTaskResults.id}).from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,task.id)).limit(1))[0];
 }
 const service={
  async prepare(context:RequestContext,taskId:string,signal?:AbortSignal):Promise<Preparation>{
   const ctx={...context};signal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;signal.throwIfAborted();
   const [task]=await db.select().from(aiTasks).where(owned(ctx,taskId));
   if(!task || task.taskType!=="asset.generate")throw new OwnershipError("素材生成任务不存在");
   if(task.executionTaskId){
    const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId));
    const frozen=assetGenerationInputSchema.parse((execution?.payload as {modelInput?:unknown})?.modelInput);
    const expected=assetGenerationInputSchema.parse({...frozen,...fields(task)});
    if(!isDeepStrictEqual(expected,frozen))throw new Error("素材输入与原执行不符");
    const mapped=await authority.bindAiTask(ctx,task.id);signal.throwIfAborted();return mapped;
   }
   if(task.status!=="queued" || task.leaseOwner || task.leaseToken || task.modelCallStartedAt)throw new Error("素材任务已执行，须沿原任务对账");
   if(await hasLegacy(db,task))return {legacy:true};
   const input=fields(task),capability=input.capability as "image.generate"|"video.generate";
   if(task.projectId)await awaitPreparation(()=>deps.assertProject(ctx,task.projectId!),signal);
   const resolved=await awaitPreparation(()=>deps.resolveSpec(ctx,capability,task.id),signal);
   const {token:_token,...configuration}=resolved;
   const spec=assetCredentialSchema.omit({token:true}).parse(configuration);
   if(spec.kind!==input.mediaKind)throw new Error("素材类型与模型配置不符");
   const {provider,model,baseUrl,serviceId,kind:_kind,...options}=spec;
   const runtimeOptionsDigest=`sha256:${createHash("sha256").update(canonicalJson(assetRuntimeOptionsSchema.parse(options))).digest("hex")}`;
   const modelInput=assetGenerationInputSchema.parse({...input,provider,model,baseUrl,...(serviceId?{serviceId}:{}),runtimeOptionsDigest});
   return db.transaction(async tx=>{
    signal?.throwIfAborted();const [current]=await tx.select().from(aiTasks).where(owned(ctx,task.id)).for("update");
    if(!current || current.requestFingerprint!==task.requestFingerprint || !isDeepStrictEqual(current.inputData,task.inputData) || current.projectId!==task.projectId)throw new Error("素材准备期间原任务发生变化");
    if(!current.executionTaskId && await hasLegacy(tx,current)){signal!.throwIfAborted();return {legacy:true};}
    signal?.throwIfAborted();
    const mapped=await createExecutionAuthorityService(tx as unknown as Db,{now:deps.now}).bindAiTask(ctx,task.id,{requestFingerprint:task.requestFingerprint,modelInput,budget:deps.budget});
    signal!.throwIfAborted();return mapped;
   });
  },
  async resolveCredential(ctx:RequestContext,owner:{aiTaskId:string;executionTaskId:string}){
   const [task]=await db.select().from(aiTasks).where(owned(ctx,owner.aiTaskId));
   if(!task || task.executionTaskId!==owner.executionTaskId || task.taskType!=="asset.generate")throw new OwnershipError("素材执行不存在");
   return deps.resolveSpec(ctx,fields(task).capability as "image.generate"|"video.generate",task.id);
  },
  stop(){controller.abort();},
  async recoverQueued(onLegacy:(ctx:RequestContext,id:string)=>Promise<void>,onFailure:(ctx:RequestContext,id:string)=>Promise<void>,shouldStop=()=>false){
   let cursor:string|undefined;
   while(!shouldStop() && !controller.signal.aborted){
    const rows=await db.select().from(aiTasks).where(and(eq(aiTasks.taskType,"asset.generate"),eq(aiTasks.status,"queued"),isNull(aiTasks.executionTaskId),isNull(aiTasks.leaseOwner),sql`${aiTasks.runtimeData}->'hostTaskSubmission' IS NULL`,...(cursor?[sql`${aiTasks.id} > ${cursor}`]:[]))).orderBy(asc(aiTasks.id)).limit(50);
    if(!rows.length)return;
    for(const task of rows){if(shouldStop() || controller.signal.aborted)return;cursor=task.id;const ctx:RequestContext={userId:task.userId,accountId:task.accountId,requestId:`asset-recover:${task.id}`,source:"user"};try{const result=await service.prepare(ctx,task.id);if(shouldStop() || controller.signal.aborted)return;if(result.legacy)await onLegacy(ctx,task.id);}catch{if(shouldStop() || controller.signal.aborted)return;await onFailure(ctx,task.id);}}
   }
  },
 };
 return service;
}
