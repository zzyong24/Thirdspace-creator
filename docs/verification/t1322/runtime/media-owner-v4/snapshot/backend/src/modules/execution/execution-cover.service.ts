import {executionAssetCredentialSchema} from '@creatoros/contract/execution-worker';
import {workspaceFilter} from "../../workspace-scope";
import {createHash} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import {and,asc,eq,executionCalls,executionTasks,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {workerPortInputSchemas,assetCredentialSchema,assetRuntimeOptionsSchema,coverImagePreparationSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import {replayStructuredGeneration,generationRequestDigest,type GenerationReplayReceipt} from "@creatoros/ai-worker/chat";
import {providerIdentityFor,structuredModeForIdentity} from "@creatoros/ai-worker/model-identity";
import {getTemplate,runWithEffectiveSkillSnapshot,type CoverBriefOutput} from "@creatoros/ai-worker";
import {projectCoverPlan,type CoverContext} from "@creatoros/ai-worker/cover";
import {projectGraphicCardPlan} from "@creatoros/ai-worker/graphic-card-plan";
import {canonicalJson} from "../ai/canonical-json";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {executionModelIdentitySchema} from "./execution-model-identity.service";
import {bindCoverExecution,readCoverImageBinding,type CoverScope} from "./cover-execution-binding";
import {supportsAssetGenerationMode,referenceImageAllowed,assetGenerationParameterError} from "../ai-runtime/asset-generation-modes";
import {ConflictError} from "./execution.errors";
type Call=typeof executionCalls.$inferSelect;
export interface CoverExecutionPorts {
 resolveImageSpec(ctx:RequestContext,capability:"image.generate"|"image.edit",taskId:string):Promise<unknown>;
 getReferenceBytes(ctx:RequestContext,assetId:string,assetFileId?:string):Promise<{bytes:Uint8Array;mimeType:string}|null>;
}
/** 原模型回执只读回放确定图片输入；无模型请求、无第二账本。 */
export function createExecutionCoverService(db:Db,deps:Parameters<typeof createExecutionCallLedgerService>[1]&CoverExecutionPorts){
 const leases=createExecutionLeaseService(db,deps);
 const ledger=(database=db)=>createExecutionCallLedgerService(database,deps);
 const access=<T>(ref:ExecutionRef,mode:"admission"|"settlement",fn:(scope:CoverScope,state:Awaited<ReturnType<typeof bindCoverExecution>>,rows:Call[])=>Promise<T>)=>leases.withLease(ref,mode,async scope=>{
  const state=await bindCoverExecution(scope),rows=await scope.tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id)).orderBy(asc(executionCalls.sequence));
  return fn(scope,state,rows);
 });
 // SEMANTIC_BOUNDARY_ALLOW: 同键明确拒绝重试按账本序列归并，不判断封面内容。
 function modelRows(rows:Call[],key:string){
  const models:Call[]=[];
  for(const row of rows.filter(row=>row.operationKey!==`${key}/image`)){
   const prefix=`${key}/model/`,suffix=row.operationKey.startsWith(prefix)?row.operationKey.slice(prefix.length):"",index=Number(suffix);
   if(row.kind!=="model"||row.parentCallId||row.toolExecutionClaimId||row.accountingBasis!=="tokens"||!/^[1-9][0-9]*$/.test(suffix))throw new ConflictError("封面文案调用序列不连续，须沿原任务核对");
   if(index===models.length+1){if(row.retryOfCallId)throw new ConflictError("新封面逻辑调用不能冒用重试来源");models.push(row);}
   else if(index===models.length && models.length){
    const previous=models[index-1]!;
    if(previous.status!=="rejected"||previous.rejectionCode==="STRUCTURED_PROTOCOL_UNSUPPORTED"||row.retryOfCallId!==previous.id||row.inputDigest!==previous.inputDigest||row.reservedTokens!==previous.reservedTokens)throw new ConflictError("封面重试缺少同键明确拒绝证据");
    models[index-1]=row;
   }else throw new ConflictError("封面逻辑调用序号不连续");
  }
  return models;
 }
 function receipts(rows:Call[]):GenerationReplayReceipt[]{return rows.map(row=>{
  if(row.status==="settled"&&row.providerResult&&row.totalTokens!==null)return {inputDigest:row.inputDigest,status:"settled",providerResult:row.providerResult};
  if(row.status==="rejected"&&row.rejectionCode==="STRUCTURED_PROTOCOL_UNSUPPORTED")return {inputDigest:row.inputDigest,status:"rejected",rejectionCode:row.rejectionCode};
  throw new ConflictError("封面模型结果未知或未结算，不能续号");
 });}
 async function replay(rawIdentity:unknown,input:Awaited<ReturnType<typeof bindCoverExecution>>["input"],rows:Call[],signal?:AbortSignal){
  const identity=executionModelIdentitySchema.parse(rawIdentity);
  if(identity.capability!==input.capability)throw new ConflictError("封面模型身份与冻结能力不符");
  return runWithEffectiveSkillSnapshot(input.skillSnapshot,()=>replayStructuredGeneration<CoverBriefOutput>({...providerIdentityFor(identity),structuredOutputMode:structuredModeForIdentity(identity),receipts:receipts(rows),signal},{template:getTemplate(input.skillId),facets:input.facets,maxOutputTokens:input.maxOutputTokens,timeoutMs:input.timeoutMs}));
 }
 const service={
  async reserveModel(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const request=workerPortInputSchemas.reserveCoverModel.parse(raw);signal?.throwIfAborted();
   return access(ref,"admission",async(scope,state,rows)=>{
    if(state.payload.coverImage)throw new ConflictError("封面文案已完成，不能新开模型调用");
    const models=modelRows(rows,state.input.operationKey),index=Number(request.operationKey.slice(`${state.input.operationKey}/model/`.length));
    if(request.operationKey!==`${state.input.operationKey}/model/${index}`||!Number.isSafeInteger(index)||index<1||index>models.length+1)throw new ConflictError("封面模型操作键不符");
    if(request.request.maxOutputTokens!==state.input.maxOutputTokens||"headers"in request.request||"abortSignal"in request.request)throw new ConflictError("封面模型请求预算或字段非法");
    const expected=await replay(state.payload.modelIdentity,state.input,models.slice(0,index-1),signal),digest=generationRequestDigest(request.request);
    if(expected.status!=="next-request"||generationRequestDigest(expected.request)!==digest)throw new ConflictError("封面模型请求不属于原节点");
    if(models[index-1]&&models[index-1]!.inputDigest!==digest)throw new ConflictError("封面原请求发生变化");
    const previous=models[index-1],authority=scope.task.retryOfCallId;
    // 重试来源只能取当前任务授权；Worker 不携带或选择 retryOfCallId。
    const retryOfCallId=authority && previous && ((previous.id===authority && previous.status==="rejected" && previous.rejectionCode!=="STRUCTURED_PROTOCOL_UNSUPPORTED") || previous.retryOfCallId===authority) ? authority : undefined;
    if(previous?.status==="rejected" && previous.rejectionCode!=="STRUCTURED_PROTOCOL_UNSUPPORTED" && previous.id!==authority)throw new ConflictError("封面明确拒绝尚未获得原任务重试授权");
    const saved=await ledger(scope.tx as unknown as Db).reserve(ref,{operationKey:request.operationKey,kind:"model",inputDigest:digest,reservedTokens:Buffer.byteLength(JSON.stringify(request.request))+1024+state.input.maxOutputTokens,...(retryOfCallId?{retryOfCallId}:{})});
    return {callId:saved.id,status:saved.status,...(saved.providerResult?{providerResult:saved.providerResult}:{}),...(saved.rejectionCode?{rejectionCode:saved.rejectionCode}:{})};
   });
  },
  async startModel(ref:ExecutionRef,raw:unknown){const {callId}=workerPortInputSchemas.startCoverModel.parse(raw);return access(ref,"admission",async(scope,state,rows)=>{
   if(!modelRows(rows,state.input.operationKey).some(row=>row.id===callId))throw new ConflictError("封面启动缺少原模型调用");
   const saved=await ledger(scope.tx as unknown as Db).start(ref,callId);return {callId:saved.id,status:saved.status};
  });},
  async settleModel(ref:ExecutionRef,raw:unknown){const {callId,...settlement}=workerPortInputSchemas.settleCoverModel.parse(raw);return access(ref,"settlement",async(scope,state,rows)=>{
   if(!modelRows(rows,state.input.operationKey).some(row=>row.id===callId))throw new ConflictError("封面结算缺少原模型调用");
   const saved=await ledger(scope.tx as unknown as Db).settle(ref,callId,settlement);return {callId:saved.id,status:saved.status};
  });},
  async prepareImage(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   workerPortInputSchemas.prepareCoverImage.parse(raw);signal?.throwIfAborted();
   const initial=await access(ref,"admission",async(scope,state,rows)=>({...state,context:scope.context,retryOfCallId:scope.task.retryOfCallId,rows,existing:state.payload.coverImage?await readCoverImageBinding(scope):null}));
   if(initial.existing)return {status:"prepared" as const,value:coverImagePreparationSchema.parse({input:initial.existing.input,reference:initial.existing.reference,resultData:initial.existing.resultData})};
   const models=modelRows(initial.rows,initial.input.operationKey),tail=models.at(-1);
   // reserve 回执丢失安全回读原预留；明确拒绝仅在本任务已授权原 call 时恢复。
   if(tail?.status==="reserved" || (tail?.status==="rejected" && tail.rejectionCode!=="STRUCTURED_PROTOCOL_UNSUPPORTED" && tail.id===initial.retryOfCallId)){
    const expected=await replay(initial.payload.modelIdentity,initial.input,models.slice(0,-1),signal);
    if(expected.status!=="next-request"||generationRequestDigest(expected.request)!==tail.inputDigest)throw new ConflictError("封面待恢复调用与原节点请求不符");
    return {status:"pending" as const};
   }
   const result=await replay(initial.payload.modelIdentity,initial.input,models,signal);
   if(result.status==="next-request")return {status:"pending" as const};
   if(result.status!=="complete")throw new ConflictError("封面文案尚未完成，不能准备图片");
   const source=JSON.parse(initial.input.facets.__coverContext??"null") as {context:CoverContext;visualRequirements:string;referenceAssetId:string|null;referenceFileId?:string;referenceChecksum?:string;aspectRatio?:string};
   if(!source?.context?.topic)throw new ConflictError("封面原上下文缺失");
   const resultData=initial.input.skillId==="graphic.card-brief"
    ? projectGraphicCardPlan(result.value.object,source.context,source.visualRequirements,{aspectRatio:source.aspectRatio})
    : projectCoverPlan(result.value.object,source.context,source.visualRequirements);
   let reference:{assetId:string;assetFileId?:string;checksum:string;mimeType:string}|null=null;
   let referenceBytes:Uint8Array|undefined;
   if(source.referenceAssetId){
    const read=()=>deps.getReferenceBytes(initial.context,source.referenceAssetId!,source.referenceFileId);
    // Explicit immutable references may not silently fall back. Legacy cover references retain their established safe output path.
    const value=source.referenceFileId?await read():await read().catch(()=>null);signal?.throwIfAborted();
    if(value?.bytes.byteLength){
      const checksum=createHash("sha256").update(value.bytes).digest("hex");
      if(source.referenceChecksum&&checksum!==source.referenceChecksum)throw new ConflictError("统一参考的精确文件校验已变化，请重新选择参考");
      referenceBytes=value.bytes;
      reference={assetId:source.referenceAssetId,...(source.referenceFileId?{assetFileId:source.referenceFileId}:{}),checksum,mimeType:value.mimeType};
    }else if(source.referenceFileId)throw new ConflictError("统一参考的精确文件无法读取，可明确取消参考后重试文生图");
   }
   const capability=reference?"image.edit":"image.generate",credential=executionAssetCredentialSchema.parse(await deps.resolveImageSpec(initial.context,capability,initial.business.id));signal?.throwIfAborted();
   let value:ReturnType<typeof coverImagePreparationSchema.parse>;
   if("engine" in credential){
    if(referenceBytes&&referenceBytes.byteLength>30*1024*1024)throw new ConflictError('参考图超过原大小限制');
    value=coverImagePreparationSchema.parse({input:{kind:'asset.generate',operationKey:`${initial.input.operationKey}/image`,mediaKind:'image',capability,prompt:resultData.prompt,...(source.aspectRatio?{aspectRatio:source.aspectRatio}:{}),engine:'codex',protocolKind:credential.protocolKind,runtimeVersion:credential.runtimeVersion},reference,resultData:{...resultData,referenceImage:{requestedAssetId:source.referenceAssetId,status:source.referenceAssetId?(reference?'used':'not_used'):'not_requested',used:Boolean(reference)}}});
   }else{
   const {token:_token,provider,model,baseUrl,serviceId,kind,...options}=credential;
   if(kind!=="image")throw new ConflictError("封面图片能力配置错误");
   if(source.referenceFileId){
     if(!supportsAssetGenerationMode(credential,"image_to_image")||!reference||!referenceBytes||!referenceImageAllowed(credential,"image_to_image",reference.mimeType,referenceBytes))throw new ConflictError("当前图片模型不支持这份参考图片，可明确取消参考后文生图");
   }
   if(source.aspectRatio){const issue=assetGenerationParameterError(credential,reference?"image_to_image":"text_to_image",{prompt:resultData.prompt,aspectRatio:source.aspectRatio});if(issue)throw new ConflictError(issue);}
   value=coverImagePreparationSchema.parse({input:{kind:"asset.generate",operationKey:`${initial.input.operationKey}/image`,mediaKind:"image",capability,prompt:resultData.prompt,...("aspectRatio" in resultData && resultData.aspectRatio?{aspectRatio:resultData.aspectRatio}:{}),provider,model,baseUrl,...(serviceId?{serviceId}:{}),runtimeOptionsDigest:`sha256:${createHash("sha256").update(canonicalJson(assetRuntimeOptionsSchema.parse(options))).digest("hex")}`},reference,resultData:{...resultData,referenceImage:{requestedAssetId:source.referenceAssetId,...(source.referenceFileId?{requestedAssetFileId:source.referenceFileId}:{}),status:source.referenceAssetId?(reference?"used":"not_used"):"not_requested",used:Boolean(reference)}}});
   }
   return access(ref,"admission",async(scope,state,rows)=>{
    signal?.throwIfAborted();if(state.payload.coverImage){const saved=await readCoverImageBinding(scope);return {status:"prepared" as const,value:coverImagePreparationSchema.parse({input:saved.input,reference:saved.reference,resultData:saved.resultData})};}
    if(state.sourceDigest!==initial.sourceDigest||!isDeepStrictEqual(rows,initial.rows))throw new ConflictError("封面准备期间原调用改变");
    await scope.tx.update(executionTasks).set({payload:{...state.payload,coverImage:{sourceDigest:state.sourceDigest,value}}}).where(eq(executionTasks.id,scope.task.id));return {status:"prepared" as const,value};
   });
  },
  async resolveCredential(ctx:RequestContext,owner:{aiTaskId:string;executionTaskId:string}){
   const bound=await db.transaction(async tx=>{
    const [execution]=await tx.select().from(executionTasks).where(and(
     eq(executionTasks.id,owner.executionTaskId),
     eq(executionTasks.ownerId,owner.aiTaskId),
     eq(executionTasks.userId,ctx.userId),
     workspaceFilter(executionTasks,ctx),
    ));
    if(!execution)throw new ConflictError("封面图片任务不存在");
    // 两种既有任务均须证明真实业务配对、原输入与图片准备；不能只按类型放行。
    const prepared=await readCoverImageBinding({tx,task:execution,context:ctx});
    if(prepared.business.id!==owner.aiTaskId||
     prepared.business.accountId!==execution.accountId||
     prepared.business.groupId!==execution.groupId){
     throw new ConflictError("封面图片任务不存在");
    }
    return {
     taskId:prepared.business.id,
     capability:prepared.reference?"image.edit" as const:"image.generate" as const,
    };
   });
   return deps.resolveImageSpec(ctx,bound.capability,bound.taskId);
  },
  async readReference(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {callId}=workerPortInputSchemas.readCoverReference.parse(raw);
   const state=await access(ref,"admission",async(scope,_state,rows)=>{const prepared=await readCoverImageBinding(scope);const row=rows.find(row=>row.id===callId);if(!row||row.operationKey!==prepared.input.operationKey||row.inputDigest!==`sha256:${createHash("sha256").update(canonicalJson(prepared.input)).digest("hex")}`)throw new ConflictError("参考图不属于原图片调用");return {...prepared,context:scope.context};});
   if(!state.reference)return null;
   const value=await deps.getReferenceBytes(state.context,state.reference.assetId,state.reference.assetFileId);signal?.throwIfAborted();
   if(!value||value.mimeType!==state.reference.mimeType||createHash("sha256").update(value.bytes).digest("hex")!==state.reference.checksum)throw new ConflictError("参考图已变化或无法读取，不能偷偷更换图片输入");
   return value;
  },
 };
 return service;
}
