import {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
import {eq,executionTasks,executionCalls,aiTasks,aiTaskSteps,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {workerPortInputSchemas,transcribeSourceSchema,transcribeItemReceiptSchema,type ExecutionRef,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createTranscriptArtifactService} from '../projects/transcript-artifact.service';
import {createExecutionLeaseService} from './execution-lease.service';
import {bindTranscribeExecution,type TranscribeExecutionScope} from './transcribe-execution-binding';
import type {createExecutionTranscribePostprocessService} from './execution-transcribe-postprocess.service';
import {ConflictError} from './execution.errors';
type Receipt=z.infer<typeof transcribeItemReceiptSchema>;
export interface TranscribeWorkflowDeps {
 now:()=>string;nextId:(prefix:string)=>string;
 hasTranscriptArtifact(ctx:RequestContext,awemeId:string):Promise<boolean>;
 onTranscriptReady?(ctx:RequestContext,input:{awemeId:string;projectId:string}):Promise<void>;
}
/** 后端只持有原作品绑定、工件和任务终态；不执行浏览器、抽音或模型。 */
export function createExecutionTranscribeWorkflowService(db:Db,deps:TranscribeWorkflowDeps&{postprocess:Pick<ReturnType<typeof createExecutionTranscribePostprocessService>,'read'>}){
 const leases=createExecutionLeaseService(db,deps);
 const access=<T>(ref:ExecutionRef,awemeId:string,fn:(scope:TranscribeExecutionScope,state:Awaited<ReturnType<typeof bindTranscribeExecution>>)=>Promise<T>)=>leases.withLease(ref,'admission',async scope=>fn(scope,await bindTranscribeExecution(scope,awemeId)));
 const entries=(payload:Record<string,unknown>)=>z.record(z.string(),transcribeItemReceiptSchema).parse(payload.transcribeItems??{});
 const sources=(payload:Record<string,unknown>)=>z.record(z.string(),transcribeSourceSchema).parse(payload.transcribeSources??{});
 async function store(scope:TranscribeExecutionScope,state:Awaited<ReturnType<typeof bindTranscribeExecution>>,receipt:Receipt){
  await scope.tx.update(executionTasks).set({payload:{...state.payload,transcribeItems:{...entries(state.payload),[receipt.awemeId]:receipt}}}).where(eq(executionTasks.id,scope.task.id));
  await scope.tx.insert(aiTaskSteps).values({id:`transcribe:${scope.task.id}:${receipt.awemeId}:${receipt.status}`,aiTaskId:state.business.id,stepNo:state.input.awemeIds.indexOf(receipt.awemeId)+1,kind:receipt.status==='failed'?'error':'transcribe',text:`作品 ${receipt.awemeId}：${receipt.error??({existing:'已有逐字稿，已跳过重复识别',saved:'逐字稿已保存','image-album':'图集作品，无口播音频','no-project':'未找到对应作品，未保存',failed:'转写失败'}[receipt.status])}`,toolCalls:[],createdAt:deps.now()}).onConflictDoNothing();
  return receipt;
 }
 const service={
  async prepareItem(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {awemeId}=workerPortInputSchemas.prepareTranscribeItem.parse(raw),initial=await access(ref,awemeId,async(scope,state)=>({context:scope.context,receipt:entries(state.payload)[awemeId]??null,source:sources(state.payload)[awemeId]??null}));signal?.throwIfAborted();
   if(initial.receipt&&initial.receipt.status!=='failed')return {receipt:initial.receipt,source:initial.source};
   const exists=await deps.hasTranscriptArtifact(initial.context,awemeId);signal?.throwIfAborted();
   return access(ref,awemeId,async(scope,state)=>{
    signal?.throwIfAborted();const previous=entries(state.payload)[awemeId];
    if(previous&&previous.status!=='failed')return {receipt:previous,source:sources(state.payload)[awemeId]??null};
    if(!exists)return {receipt:null,source:sources(state.payload)[awemeId]??null};
    const receipt=await store(scope,state,{awemeId,status:'existing',projectId:null,error:null});
    await createTranscriptArtifactService({db:scope.tx as unknown as Db,now:deps.now,nextId:deps.nextId}).restoreExisting(scope.context,awemeId);
    return {receipt,source:sources(state.payload)[awemeId]??null};
   });
  },
  async recordSource(ref:ExecutionRef,raw:unknown){const {awemeId,source}=workerPortInputSchemas.recordTranscribeSource.parse(raw);return access(ref,awemeId,async(scope,state)=>{
   if(Object.hasOwn((state.payload.transcribeAudioInputs??{}) as object,awemeId)||entries(state.payload)[awemeId]?.status==='saved')throw new ConflictError('已开始识别，不能改写原作品来源');
   await scope.tx.update(executionTasks).set({payload:{...state.payload,transcribeSources:{...sources(state.payload),[awemeId]:source}}}).where(eq(executionTasks.id,scope.task.id));return {ok:true as const};
  });},
  async saveArtifact(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {awemeId}=workerPortInputSchemas.saveTranscribeArtifact.parse(raw);
   const initial=await access(ref,awemeId,async(scope,state)=>({context:scope.context,source:sources(state.payload)[awemeId],receipt:entries(state.payload)[awemeId]}));
   if(initial.receipt&&initial.receipt.status!=='failed')return initial.receipt;
   const album=initial.source?.kind==='image-album';
   const post=album?null:await deps.postprocess.read(ref,{awemeId},signal);
   if(!album&&(!post||!post.transcript.trim()))throw new ConflictError('逐字稿缺少完整识别与后处理回执');
   signal?.throwIfAborted();
   const result=await access(ref,awemeId,async(scope,state)=>{
    signal?.throwIfAborted();const previous=entries(state.payload)[awemeId];if(previous&&previous.status!=='failed')return previous;
    if(album&&sources(state.payload)[awemeId]?.kind!=='image-album')throw new ConflictError('图集来源已变化');
    if(!album){const frozen=(state.payload.transcribePostprocess as Record<string,{result?:unknown}>|undefined)?.[awemeId]?.result;if(!isDeepStrictEqual(frozen,post))throw new ConflictError('后处理最终正文与原回执不符');}
    const bound=await createTranscriptArtifactService({db:scope.tx as unknown as Db,now:deps.now,nextId:deps.nextId}).ensure(scope.context,{awemeId,transcript:album?'(图集作品,无口播音频)':post!.transcript,source:album?'image-album':'transcribed',...(album?{skipMasterScript:true}:{})});
    signal?.throwIfAborted();return store(scope,state,{awemeId,status:bound.status==='skipped'&&bound.reason==='no-imported-project'?'no-project':album?'image-album':'saved',projectId:'projectId'in bound?bound.projectId??null:null,error:null});
   });
   if(result.projectId&&!album&&deps.onTranscriptReady){try{signal?.throwIfAborted();await deps.onTranscriptReady(initial.context,{awemeId,projectId:result.projectId});}catch{/* 派生任务失败不能反转已保存事实。 */}}
   return result;
  },
  async failItem(ref:ExecutionRef,raw:unknown){const {awemeId,error}=workerPortInputSchemas.failTranscribeItem.parse(raw);return access(ref,awemeId,async(scope,state)=>{
   const previous=entries(state.payload)[awemeId];if(previous&&previous.status!=='failed')return previous;
   const calls=await scope.tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id));
   if(calls.some(call=>['started','unknown','reserved'].includes(call.status)))throw new ConflictError('转写仍有未确认调用，不能报告普通作品失败');
   return store(scope,state,{awemeId,status:'failed',projectId:null,error});
  });},
  async complete(ref:ExecutionRef,raw:unknown){workerPortInputSchemas.completeTranscribeTask.parse(raw);return leases.withLease(ref,'settlement',async scope=>{
   const first=(scope.task.payload as {modelInput?:{awemeIds?:string[]}}).modelInput?.awemeIds?.[0];if(!first)throw new ConflictError('转写作品输入缺失');
   const state=await bindTranscribeExecution(scope,first),saved=entries(state.payload);
   if(state.input.awemeIds.some(id=>!saved[id]))throw new ConflictError('转写作品尚未全部处理');
   const calls=await scope.tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id));
   if(calls.some(call=>['reserved','started','unknown'].includes(call.status)))throw new ConflictError('转写仍有未确认调用');
   const failed=state.input.awemeIds.filter(id=>saved[id]!.status==='failed').length,status=failed?'failed' as const:'succeeded' as const;
   if(['succeeded','failed'].includes(scope.task.status))return {status};
   if(scope.task.status!=='running')throw new ConflictError('当前转写已停止，不能覆盖终态');
   const stamp=deps.now(),message=failed?`${failed} 个作品转写失败，已保存其它完成结果`:null;
   await scope.tx.update(aiTasks).set({status,completedAt:stamp,errorMessage:message,leaseOwner:null,leaseToken:null,leaseExpiresAt:null}).where(eq(aiTasks.id,state.business.id));
   await scope.tx.update(executionTasks).set({status,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,retryAt:null,retryOfCallId:null,lastErrorCode:failed?'TRANSCRIBE_ITEMS_FAILED':null,lastErrorMessage:message,updatedAt:stamp}).where(eq(executionTasks.id,scope.task.id));return {status};
  });},
  async invoke(ref:ExecutionRef,port:WorkerPort,raw:unknown,signal?:AbortSignal):Promise<unknown>{
   if(port==='prepareTranscribeItem')return service.prepareItem(ref,raw,signal);
   if(port==='recordTranscribeSource')return service.recordSource(ref,raw);
   if(port==='saveTranscribeArtifact')return service.saveArtifact(ref,raw,signal);
   if(port==='failTranscribeItem')return service.failItem(ref,raw);
   if(port==='completeTranscribeTask')return service.complete(ref,raw);
   throw new ConflictError('不是转写编排端口');
  },
 };
 return service;
}
