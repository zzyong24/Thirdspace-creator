import {withWorkspaceWrite} from "../../workspace-write";
import {assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {workspaceFilter} from "../../workspace-scope";
import type {BoundedExecutionBudget,ExecutionBudget} from "@creatoros/contract/execution-worker";
import {prepareLegacyAssetRecovery} from "./asset-legacy-recovery.service";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {and,asc,eq,isNull,sql,aiTasks,aiTaskResults,executionTasks,OwnershipError,type Db} from "@creatoros/backend";
import {canvasProposalAdmissionSchema,type CanvasProposalAdmission,type RequestContext} from "@creatoros/contract";
import {assetGenerationInputSchema,assetCredentialSchema,assetRuntimeOptionsSchema} from "@creatoros/contract/execution-worker";
import {canonicalJson} from "../ai/canonical-json";
import {awaitPreparation} from "../execution/await-preparation";
import {createExecutionAuthorityService,type PreparedModelExecution} from "../execution/execution-authority.service";
import type {MultimodalSpec} from "./multimodal/resolve";
import {supportsAssetGenerationMode,referenceImageAllowed,assetGenerationParameterError} from "./asset-generation-modes";
type Task=typeof aiTasks.$inferSelect;
class LegacyFactAppeared extends Error{}
type Preparation={aiTaskId:string;executionTaskId:string};
function fields(task:Task,legacyPlain=false){
 const raw=task.inputData as Record<string,unknown>,mediaKind=raw.kind==="video"?"video":"image";
 if(typeof raw.prompt!=="string" || !raw.prompt.trim())throw new Error("素材生成缺少描述");
 const referenceAssetId=!legacyPlain&&typeof raw.referenceAssetId==="string" && raw.referenceAssetId.trim()?raw.referenceAssetId:null;
 const mode=legacyPlain?undefined:raw.mode===undefined?(referenceAssetId?(mediaKind==="image"?"image_to_image":"image_to_video"):undefined):raw.mode;
 if(mode!==undefined && !["text_to_image","image_to_image","text_to_video","image_to_video"].includes(String(mode)))throw new Error("素材生成模式无效");
 if(mode && (String(mode).endsWith("_image")?"image":"video")!==mediaKind)throw new Error("素材生成模式与类型不符");
 if(Boolean(referenceAssetId)!==Boolean(mode && String(mode).startsWith("image_to_")))throw new Error("参考图与生成模式不一致");
 const capability=mode==="image_to_image"?"image.edit":`${mediaKind}.generate`;
 return {kind:"asset.generate" as const,operationKey:"asset.generate",mediaKind,capability,prompt:raw.prompt,
  ...(mode?{mode:mode as "text_to_image"|"image_to_image"|"text_to_video"|"image_to_video"}:{}),
  ...(typeof raw.aspectRatio==="string"?{aspectRatio:raw.aspectRatio}:{}),
  ...(mediaKind==="video"?{durationSec:typeof raw.durationSec==="number" && Number.isInteger(raw.durationSec)?raw.durationSec:6,resolution:raw.resolution==="2K"?"2K":"768P"}:{}),
 };
}
/** 新调用单向转交；旧素材仅恢复原 provider job 或呈现核对状态，不能重新计费。 */
export function createAssetBusinessExecutionService(db:Db,deps:{budget:BoundedExecutionBudget;now?:()=>string;resolveSpec(ctx:RequestContext,capability:"image.generate"|"image.edit"|"video.generate",taskId:string):Promise<MultimodalSpec>;assertProject(ctx:RequestContext,id:string,tx?:Db,forUpdate?:boolean):Promise<void>;assertCanvasInput?:(ctx:RequestContext,input:{attemptId:string;inputData:unknown;taskId:string},tx:Db)=>Promise<CanvasProposalAdmission|undefined>;getReference?:(ctx:RequestContext,assetId:string,fileId?:string)=>Promise<{fileId:string;checksum:string;mimeType:string;bytes:Uint8Array}|null>}){
 const controller=new AbortController();
 const authority=createExecutionAuthorityService(db,{now:deps.now});
 const owned=(ctx:RequestContext,id:string)=>and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx));
 async function hasLegacy(tx:Pick<Db,"select">,task:Task){
  if(task.modelCallStartedAt || task.startedAt || task.retryOfTaskId || Object.prototype.hasOwnProperty.call(task.runtimeData??{},"multimodalProviderCheckpoint"))return true;
  return !!(await tx.select({id:aiTaskResults.id}).from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,task.id)).limit(1))[0];
 }
 async function assertCanvasInput(ctx:RequestContext,task:Task,tx:Db){
  if(!Object.prototype.hasOwnProperty.call(task.inputData??{},"canvasOwner"))return;
  if(!deps.assertCanvasInput)throw new Error("画布生成原预约核验未装配");
  if(!task.attemptId)throw new Error("画布生成缺少原attempt");
  const admission=await deps.assertCanvasInput(ctx,{attemptId:task.attemptId,inputData:task.inputData,taskId:task.id},tx);
  const raw=task.inputData as Record<string,unknown>;
  if(Object.prototype.hasOwnProperty.call(raw,"projectId")&&(raw.projectId??null)!==task.projectId)throw new Error("画布原项目与冻结任务不符");
  const owner=raw.canvasOwner as Record<string,unknown>;
  if(Object.hasOwn(owner,'proposalAdmission')){
   const expected=canvasProposalAdmissionSchema.parse(owner.proposalAdmission);
   if(!admission||!isDeepStrictEqual(admission,expected))throw new Error('画布生成缺少已核验的确认事实');
   return admission;
  }
  if(admission!==undefined)throw new Error('原画布输入没有确认事实，不能补新预算');
  return undefined;
 }
 function admittedBudget(task:Task,admission:CanvasProposalAdmission,inherited?:ExecutionBudget):BoundedExecutionBudget{
  const deadlineMs=Date.parse(admission.deadlineAt)-Date.parse(task.requestedAt);
  if(!Number.isInteger(deadlineMs)||deadlineMs<=0)throw new Error('原画布生成预算已耗尽');
  const budget={maxCalls:admission.assetLimit.maxCalls,maxTokens:admission.assetLimit.maxTokens,deadlineMs};
  if(inherited!==undefined&&!isDeepStrictEqual(inherited,budget))throw new Error('继承预算与首次确认冻结值不符');
  return budget;
 }
 function assertDeadline(admission:CanvasProposalAdmission){
  if(Date.parse((deps.now??(()=>new Date().toISOString()))())>=Date.parse(admission.deadlineAt))throw new Error('原画布生成预算已耗尽');
 }
 function assertMappedAdmission(execution:typeof executionTasks.$inferSelect|undefined,budget:BoundedExecutionBudget,admission:CanvasProposalAdmission){
  if(!execution||!isDeepStrictEqual(execution.executionBudget,budget)||execution.deadlineAt!==admission.deadlineAt)throw new Error('原画布生成执行预算或截止时间不符');
 }

 const service={
  async prepare(context:RequestContext,taskId:string,signal?:AbortSignal,inheritedBudget?:ExecutionBudget):Promise<Preparation>{
   let ctx={...context};signal=signal?AbortSignal.any([signal,controller.signal]):controller.signal;signal.throwIfAborted();
   const [task]=await db.select().from(aiTasks).where(owned(ctx,taskId));
   if(!task || task.taskType!=="asset.generate")throw new OwnershipError("素材生成任务不存在");
   // 现页只授权访问；后续恢复/模型解析始终保存原任务身份。
   ctx={...ctx,accountId:task.accountId,groupId:task.groupId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined};
   const admission=await assertCanvasInput(ctx,task,db),budget=admission?admittedBudget(task,admission,inheritedBudget):inheritedBudget??deps.budget;
   if(admission){assertDeadline(admission);signal=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Date.parse(admission.deadlineAt)-Date.parse((deps.now??(()=>new Date().toISOString()))())))]);}

   if(task.executionTaskId){
    const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,task.executionTaskId));
    const recovery=(execution?.payload as {assetLegacyRecovery?:{inputData:unknown;requestFingerprint:string}})?.assetLegacyRecovery;
    if(!execution||execution.userId!==task.userId||execution.accountId!==task.accountId||execution.groupId!==task.groupId||execution.groupVersion!==task.groupVersion||execution.membershipVersion!==task.membershipVersion||execution.ownerId!==task.id||execution.ownerType!=="ai_task"||execution.kind!=="ai_task")throw new OwnershipError("素材执行原归属不符");
    if(admission){assertMappedAdmission(execution,budget as BoundedExecutionBudget,admission);if(recovery)throw new Error('已确认画布任务不能转为旧恢复执行');}
    if(recovery){
     if(!isDeepStrictEqual(recovery.inputData,task.inputData)||recovery.requestFingerprint!==task.requestFingerprint)throw new Error("历史素材输入与原恢复记录不符");
     return authority.bindAiTask(ctx,task.id);
    }
    const frozen=assetGenerationInputSchema.parse((execution?.payload as {modelInput?:unknown})?.modelInput);
    const expected=assetGenerationInputSchema.parse({...frozen,...fields(task,!frozen.mode)});
    const raw=task.inputData as Record<string,unknown>;
    if(!isDeepStrictEqual(expected,frozen)
      || Boolean(frozen.mode)&&(frozen.reference?.assetId??null)!==(typeof raw.referenceAssetId==="string"?raw.referenceAssetId:null)
      || (Boolean(frozen.mode)&&typeof raw.referenceFileId==="string" && frozen.reference?.fileId!==raw.referenceFileId)
      || (Boolean(frozen.mode)&&typeof raw.referenceChecksum==="string" && frozen.reference?.checksum!==raw.referenceChecksum))throw new Error("素材输入与原执行不符");
    const mapped=await authority.bindAiTask(ctx,task.id);if(admission)assertDeadline(admission);signal.throwIfAborted();return mapped;
   }
   if(task.status!=="queued" || task.leaseOwner || task.leaseToken)throw new Error("素材任务已执行，须沿原任务对账");
   const legacy=await hasLegacy(db,task);
   if(admission&&legacy)throw new Error('已确认画布任务有原执行事实，请核对原任务');
   const input=fields(task,legacy),capability=input.capability as "image.generate"|"image.edit"|"video.generate";
   if(task.projectId)await awaitPreparation(()=>deps.assertProject(ctx,task.projectId!),signal);
   let modelInput:import('zod').z.infer<typeof assetGenerationInputSchema>;
   try{
    const resolved=await awaitPreparation(()=>deps.resolveSpec(ctx,capability,task.id),signal);
    const {token:_token,...configuration}=resolved;
    const spec=assetCredentialSchema.omit({token:true}).parse(configuration);
    if(spec.kind!==input.mediaKind)throw new Error("素材类型与模型配置不符");
    if(input.mode && !supportsAssetGenerationMode(spec,input.mode))throw new Error("当前模型渠道不支持该生成模式");
    if(input.mode){const issue=assetGenerationParameterError(spec,input.mode,input);if(issue)throw new Error(issue);}
    let reference:import('zod').z.infer<typeof assetGenerationInputSchema>["reference"];
    const referenceAssetId=(task.inputData as Record<string,unknown>).referenceAssetId;
    if(!legacy&&typeof referenceAssetId==="string"){
      if(!deps.getReference)throw new Error("参考素材服务未配置");
      const rawFileId=(task.inputData as Record<string,unknown>).referenceFileId;
      const snapshot=await awaitPreparation(()=>deps.getReference!(ctx,referenceAssetId,typeof rawFileId==="string"?rawFileId:undefined),signal);
      if(!snapshot || !input.mode || !referenceImageAllowed(spec,input.mode,snapshot.mimeType,snapshot.bytes))throw new Error("参考图不可用，或不符合当前模型的格式、尺寸与大小限制");
      const actual=createHash("sha256").update(snapshot.bytes).digest("hex");
      if(snapshot.checksum!==actual)throw new Error("参考图校验失败，请重新导入素材");
      if(typeof rawFileId==="string" && snapshot.fileId!==rawFileId)throw new Error("参考图文件版本不符");
      const rawChecksum=(task.inputData as Record<string,unknown>).referenceChecksum;
      if(typeof rawChecksum==="string" && rawChecksum!==actual)throw new Error("参考图与提交时版本不符");
      reference={assetId:referenceAssetId,fileId:snapshot.fileId,checksum:actual,mimeType:snapshot.mimeType};
    }
    const {provider,model,baseUrl,serviceId,kind:_kind,...options}=spec;
    const runtimeOptionsDigest=`sha256:${createHash("sha256").update(canonicalJson(assetRuntimeOptionsSchema.parse(options))).digest("hex")}`;
    modelInput=assetGenerationInputSchema.parse({...input,...(reference?{reference}:{}),provider,model,baseUrl,...(serviceId?{serviceId}:{}),runtimeOptionsDigest});
   }catch(error){signal.throwIfAborted();if(legacy)return prepareLegacyAssetRecovery(db,ctx,task,undefined,{deadlineMs:deps.budget.deadlineMs,now:deps.now??(()=>new Date().toISOString()),signal,assertProject:deps.assertProject});throw error;}
   if(admission)assertDeadline(admission);
   if(legacy)return prepareLegacyAssetRecovery(db,ctx,task,modelInput,{deadlineMs:deps.budget.deadlineMs,now:deps.now??(()=>new Date().toISOString()),signal,assertProject:deps.assertProject});
   try{return await db.transaction(async outer=>{
    await assertFrozenWorkspaceMembership(outer,task);
    return withWorkspaceWrite(outer,ctx,async tx=>{
    if(task.projectId)await deps.assertProject(ctx,task.projectId,tx,true);
    signal?.throwIfAborted();const [current]=await tx.select().from(aiTasks).where(owned(ctx,task.id)).for("update");
    if(!current || current.requestFingerprint!==task.requestFingerprint || !isDeepStrictEqual(current.inputData,task.inputData) || current.projectId!==task.projectId)throw new Error("素材准备期间原任务发生变化");
    if(!current.executionTaskId && await hasLegacy(tx,current))throw new LegacyFactAppeared("素材准备期间出现旧提交事实，请重新读取原记录");
    const currentAdmission=await assertCanvasInput(ctx,current,tx);
    if(!isDeepStrictEqual(currentAdmission,admission))throw new Error('准备期间画布确认事实已变化');
    const currentBudget=currentAdmission?admittedBudget(current,currentAdmission,inheritedBudget):budget;
    if(currentAdmission)assertDeadline(currentAdmission);
    signal?.throwIfAborted();
    const mapped=await createExecutionAuthorityService(tx,{now:deps.now}).bindAiTask(ctx,task.id,{requestFingerprint:task.requestFingerprint,modelInput,budget:currentBudget});
    if(currentAdmission){const [execution]=await tx.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId));assertMappedAdmission(execution,currentBudget as BoundedExecutionBudget,currentAdmission);assertDeadline(currentAdmission);}
    signal!.throwIfAborted();return mapped;
    });
   });}catch(error){
    if(!(error instanceof LegacyFactAppeared))throw error;
    if(admission)throw new OwnershipError('已确认画布生成出现旧恢复事实，请核对原任务，不能改用默认预算');
    // 原事务已经回滚，回读刚出现的原事实；不把未知结果转作新付费提交或普通失败。
    const [original]=await db.select().from(aiTasks).where(owned(ctx,task.id));
    if(!original||original.requestFingerprint!==task.requestFingerprint||!isDeepStrictEqual(original.inputData,task.inputData)||original.projectId!==task.projectId)throw new OwnershipError("旧素材原输入已改变，保留原记录待核对");
    return prepareLegacyAssetRecovery(db,ctx,original,modelInput,{deadlineMs:deps.budget.deadlineMs,now:deps.now??(()=>new Date().toISOString()),signal:signal!,assertProject:deps.assertProject});
   }
  },
  async resolveCredential(ctx:RequestContext,owner:{aiTaskId:string;executionTaskId:string}){
   const [task]=await db.select().from(aiTasks).where(owned(ctx,owner.aiTaskId));
   if(!task || task.executionTaskId!==owner.executionTaskId || task.taskType!=="asset.generate")throw new OwnershipError("素材执行不存在");
   const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,owner.executionTaskId));
   const frozen=assetGenerationInputSchema.parse((execution?.payload as {modelInput?:unknown})?.modelInput);
   return deps.resolveSpec(ctx,frozen.capability,task.id);
  },
  stop(){controller.abort();},
  async recoverQueued(onFailure:(ctx:RequestContext,id:string)=>Promise<void>,shouldStop=()=>false){
   let cursor:string|undefined;
   while(!shouldStop() && !controller.signal.aborted){
    const rows=await db.select().from(aiTasks).where(and(eq(aiTasks.taskType,"asset.generate"),eq(aiTasks.status,"queued"),isNull(aiTasks.executionTaskId),isNull(aiTasks.leaseOwner),isNull(aiTasks.leaseToken),sql`${aiTasks.runtimeData}->'hostTaskSubmission' IS NULL`,...(cursor?[sql`${aiTasks.id} > ${cursor}`]:[]))).orderBy(asc(aiTasks.id)).limit(50);
    if(!rows.length)return;
    for(const task of rows){if(shouldStop() || controller.signal.aborted)return;cursor=task.id;const ctx:RequestContext={userId:task.userId,accountId:task.accountId,groupId:task.groupId,groupVersion:task.groupVersion??undefined,membershipVersion:task.membershipVersion??undefined,requestId:`asset-recover:${task.id}`,source:"user"};try{await service.prepare(ctx,task.id);if(shouldStop() || controller.signal.aborted)return;}catch{if(shouldStop() || controller.signal.aborted)return;await onFailure(ctx,task.id);}}
   }
  },
 };
 return service;
}
