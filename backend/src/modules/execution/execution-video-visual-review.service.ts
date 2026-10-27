import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {and,eq,aiTasks,executionTasks,executionCalls,OwnershipError,type Db} from '@creatoros/backend';
import {executionTaskSpec,type RequestContext} from '@creatoros/contract';
import {executionTimeoutMs} from '@creatoros/contract/timeout-policy';
import {redactProviderErrorDetail} from '@creatoros/contract/provider-error-detail';
import {inheritExecutionRoute,readFrozenModelRoute,frozenExecutionEngine,codexExecutionSpec,modelGenerationInputSchema,workerPortInputSchemas,type ExecutionRef} from '@creatoros/contract/execution-worker';
import {workspaceFilter} from '../../workspace-scope';
import {createPersistentTaskService,observeCommittedTaskAttempt,observeCommittedTaskSettlement} from './persistent-task.service';
import {createExecutionLeaseService} from './execution-lease.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionWorkerCallPorts} from './execution-worker-call-ports.service';
import {createExecutionCheckpointService} from './execution-checkpoint.service';
import {createExecutionCodexCallService} from './execution-codex-call.service';
import {createExecutionStreamService} from './execution-stream.service';
import {createExecutionWorkerOutcomeService} from './execution-worker-outcome.service';
import {prepareExecutionModelIdentity} from './execution-model-identity.service';
import {createClaimedWorkerSupervision} from './claimed-worker-supervision';
import type {VideoVisualReviewer} from './video-render/executor';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const budget={maxCalls:1,maxTokens:40_000_000,deadlineMs:180_000};
export interface VideoVisualReviewServiceDeps {
 entryPath:string|(()=>string);
 /** 只解析原Pi任务authority；无视觉配置时保留原来的可选审核行为。 */
 resolvePiModelSpec(ctx:RequestContext,owner:{aiTaskId:string}):Promise<unknown|null>;
 now?:()=>string;
}
/** 成片审核复用持久执行、租约、原调用账本。原视频仍只产候选，审核失败不否定成片。 */
export function createExecutionVideoVisualReviewService(db:Db,deps:VideoVisualReviewServiceDeps){
 const now=deps.now??(()=>new Date().toISOString()),tasks=createPersistentTaskService(db,{now}),leases=createExecutionLeaseService(db,{now});
 const ledger=createExecutionCallLedgerService(db,{now,budget}),calls=createExecutionWorkerCallPorts(db,{now,budget}),checkpoints=createExecutionCheckpointService(db,{now}),codex=createExecutionCodexCallService(db),streams=createExecutionStreamService(db,{now}),outcomes=createExecutionWorkerOutcomeService(db,{now});
 const supervision=createClaimedWorkerSupervision({entryPath:deps.entryPath});
 async function parent(store:Db,ctx:RequestContext,id:string,locked=false){
  const query=store.select().from(aiTasks).where(and(eq(aiTasks.id,id),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx)));
  const [task]=await (locked?query.for('update'):query);
  if(!task||task.taskType!=='exec.video.render'||executionTaskSpec.parse((task.inputData as Record<string,unknown>).spec).taskType!=='video.render')throw new OwnershipError('成片审核原视频任务不存在');
  return task;
 }
 const freezeParentDeadline=async(ctx:RequestContext,input:{taskId:string;deadlineAt:number|null})=>db.transaction(async tx=>{
  const task=await parent(tx as unknown as Db,ctx,input.taskId,true),runtime=task.runtimeData as Record<string,unknown>??{},previous=runtime.videoRenderExecution as {deadlineAt?:unknown}|undefined;
  if(previous&&Object.hasOwn(previous,'deadlineAt')){
   if(previous.deadlineAt!==null&&(typeof previous.deadlineAt!=='number'||!Number.isFinite(previous.deadlineAt)))throw Error('原视频期限格式无效');
   return {deadlineAt:previous.deadlineAt as number|null};
  }
  const spec=executionTaskSpec.parse((task.inputData as Record<string,unknown>).spec);
  const createdDeadline=spec.constraints.timeoutSec===null?null:Date.parse(task.requestedAt)+executionTimeoutMs(spec.constraints.timeoutSec*1000);
  const deadlineAt=createdDeadline===null?null:Math.min(createdDeadline,input.deadlineAt??createdDeadline);
  await tx.update(aiTasks).set({runtimeData:{...runtime,videoRenderExecution:{deadlineAt}}}).where(eq(aiTasks.id,task.id));
  return {deadlineAt};
 });
 const review:VideoVisualReviewer=async(ctx,input,scope)=>{
  scope.signal.throwIfAborted();
  const original=await parent(db,ctx,scope.parentTaskId),runtime=original.runtimeData as Record<string,unknown>??{},frozen=runtime.videoRenderExecution as {deadlineAt?:unknown}|undefined;
  if(!frozen||frozen.deadlineAt!==scope.deadlineAt)throw Error('成片审核缺少原视频冻结期限');
  if(original.status!=='running')throw Error('原视频已停止，不能启动审核');
  if(input.mimeType!=='image/jpeg'||input.bytes.byteLength===0||input.bytes.byteLength>24_000_000)throw Error('成片审核图片无效');
  // 可选审核必须给单次模型完整的两分钟，并给成片收割留下余量。剩余不足时保留已有成片。
  const stamp=Date.parse(now()),deadlineAt=Math.min(stamp+180_000,scope.deadlineAt===null?Infinity:scope.deadlineAt-5_000);
  if(deadlineAt-stamp<120_000)throw Error('原视频剩余期限不足完整审核预算，已保留生成的成片');
  const executionRoute=inheritExecutionRoute(runtime),requestDigest=hash([original.id,original.inputData,input.mimeType,Buffer.from(input.bytes).toString('base64'),input.prompt]);
  const idempotencyKey=`video-visual-review:${original.id}`;
  const existing=(await db.select().from(executionTasks).where(and(eq(executionTasks.userId,ctx.userId),workspaceFilter(executionTasks,ctx),eq(executionTasks.kind,'ai_task'),eq(executionTasks.idempotencyKey,idempotencyKey))))[0];
  if(existing){
   const payload=existing.payload as Record<string,unknown>;
   if(existing.ownerId!==original.id||payload.stageKind!=='video.visual-review'||payload.parentAiTaskId!==original.id||payload.parentInputDigest!==hash(original.inputData)||payload.requestDigest!==requestDigest)throw Error('原成片审核输入不能改变');
   const [receipt]=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,existing.id));
   if(receipt?.status==='settled'&&receipt.resultText)return receipt.resultText;
   throw Error(`原成片审核尚未完成，请核对执行 ${existing.id}（${existing.status}）`);
  }
  const spec=executionRoute.schemaVersion===1&&executionRoute.engine==='codex'?codexExecutionSpec():await deps.resolvePiModelSpec(ctx,{aiTaskId:original.id});
  scope.signal.throwIfAborted();if(spec===null)return null;
  const prepared=prepareExecutionModelIdentity('asset.classify',spec);
  const reviewInput=modelGenerationInputSchema.parse({kind:'model.generate',operationKey:'video.visual-review',capability:'asset.classify',maxOutputTokens:2048,prompt:JSON.stringify({mimeType:input.mimeType,base64:Buffer.from(input.bytes).toString('base64'),prompt:input.prompt})});
  // 专用审核Worker用reviewInput，通用模型调度器不会把它当第二个业务生成任务领取。
  const workerId=`video-visual-review:${randomUUID()}`;
  const {bound,claim}=await db.transaction(async tx=>{
   const current=await parent(tx as unknown as Db,ctx,original.id,true);
   if(current.status!=='running'||!isDeepStrictEqual(current.runtimeData,original.runtimeData)||!isDeepStrictEqual(current.inputData,original.inputData))throw Error('原视频执行事实已改变');
   const child=await createPersistentTaskService(tx as unknown as Db,{now}).enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:original.id,idempotencyKey,maxAttempts:1,executionBudget:budget,payload:{stageKind:'video.visual-review',executionRoute,parentAiTaskId:original.id,parentInputDigest:hash(original.inputData),requestDigest,reviewInput}});
   await tx.update(executionTasks).set({deadlineAt:new Date(deadlineAt).toISOString(),payload:{stageKind:'video.visual-review',executionRoute,parentAiTaskId:original.id,parentInputDigest:hash(original.inputData),requestDigest,reviewInput,modelIdentity:prepared.identity}}).where(and(eq(executionTasks.id,child.id),eq(executionTasks.status,'queued'),eq(executionTasks.attempt,0)));
   const claim=await createPersistentTaskService(tx as unknown as Db,{now}).claimTask({taskId:child.id,workerId,leaseSeconds:300});
   if(!claim)throw Error(`原成片审核无法领取，请核对执行 ${child.id}`);
   return {bound:child,claim};
  });
  observeCommittedTaskAttempt(db,{taskId:claim.task.id,userId:claim.task.userId,attempt:claim.lease.attempt,createdAt:claim.task.createdAt,startedAt:claim.task.updatedAt});
  const ref={executionTaskId:bound.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
  let closed=false,result:string|undefined;
  const verify=async()=>{
   scope.signal.throwIfAborted();
   await leases.withLease(ref,'admission',async({task,context,tx})=>{
    const current=await parent(tx as unknown as Db,context,original.id),payload=task.payload as Record<string,unknown>;
    if(current.status!=='running'||payload.stageKind!=='video.visual-review'||task.ownerId!==current.id||payload.parentAiTaskId!==current.id||payload.parentInputDigest!==hash(current.inputData)||payload.requestDigest!==requestDigest||!isDeepStrictEqual(payload.executionRoute,executionRoute)||!isDeepStrictEqual(payload.reviewInput,reviewInput))throw Error('成片审核原归属或输入已改变');
    const saved=(current.runtimeData as Record<string,unknown>)?.videoRenderExecution as {deadlineAt?:unknown}|undefined;
    if(saved?.deadlineAt!==scope.deadlineAt||scope.deadlineAt!==null&&Date.parse(now())>=scope.deadlineAt)throw Error('原视频期限已耗尽');
   });
  };
  try{
   await supervision.run({ref,deadlineAt,verify,isClosed:()=>closed,close:()=>{closed=true;},hasDurableOutcome:()=>result!==undefined,ports:{
    async validate(current,mode){if(closed||!isDeepStrictEqual(current,ref))throw Error('成片审核执行已关闭');if(mode==='admission')await verify();else await leases.withLease(ref,mode,async()=>{});},
    async invoke(current,port,raw){
     if(port==='readTaskContext'){await verify();return reviewInput;}
     if(port==='resolveModelCredential'){await verify();if(workerPortInputSchemas.resolveModelCredential.parse(raw).capability!==reviewInput.capability)throw Error('成片审核能力不符');return prepared.credential;}
     if(port==='heartbeat'){await verify();await tasks.heartbeat({taskId:ref.executionTaskId,workerId,attempt:ref.attempt,leaseSeconds:300});return {ok:true};}
     if(port==='reserveCall'){
      await verify();const value=workerPortInputSchemas.reserveCall.parse(raw);if(value.operationKey!==reviewInput.operationKey||value.maxOutputTokens!==reviewInput.maxOutputTokens)throw Error('成片审核调用输入不符');
      const call=await ledger.reserve(ref,{operationKey:reviewInput.operationKey,kind:'model',inputDigest:`sha256:${requestDigest}`,reservedTokens:Buffer.byteLength(reviewInput.prompt)+65536+1024+reviewInput.maxOutputTokens});return {callId:call.id,status:call.status,...(call.resultText?{resultText:call.resultText}:{})};
     }
     if(port==='startCall'){await verify();return calls.startCall(ref,raw);}
     if(port==='settleCall')return calls.settleCall(ref,raw);
     if(port==='bindCodexCall'||port==='readCodexCall'||port==='recordCodexToolCall')return codex.invoke(current,port,raw);
     if(port==='appendStreamEvents')return streams.append(ref,raw);
     if(port==='readCheckpoint')return checkpoints.read(ref);
     if(port==='saveCheckpoint')return checkpoints.save(ref,raw);
     if(port==='commitResult'){
      const value=workerPortInputSchemas.commitResult.parse(raw);
      if(value.outcome!=='succeeded'){await outcomes.recordFailure(ref,value);closed=true;return {};}
      await verify();const call=(await ledger.inspect(ref)).calls.at(-1);
      if(call?.id!==value.callId||call.status!=='settled'||call.resultText!==value.text)throw Error('成片审核缺少原调用完整回执');
      await tasks.finish({taskId:ref.executionTaskId,workerId,attempt:ref.attempt,fenceToken:ref.fenceToken,status:'succeeded'});result=value.text;closed=true;return {};
     }
     throw Error('成片审核端口不可用');
    },
   }});
   if(result===undefined){
    // Worker已将明确拒绝/等待用户/未知结果写入原任务；不要用通用未完成提示抹掉诊断。
    // 只投影持久短错误，禁止附带图片、配置或供应商原始响应。
    const stopped=await tasks.get(ctx,bound.id);
    const detail=redactProviderErrorDetail([stopped.errorCode,stopped.errorMessage].filter(Boolean).join(': ')).slice(0,160);
    throw Error(`成片审核未取得完整结果${detail?`（${detail}）`:''}，请核对执行 ${bound.id}`);
   }return result;
  }catch(error){
   // 中断只终止当前原执行，已提交或未知call保留；绝不另建子任务/重新发送。
   const state=await ledger.inspect(ref),pending=state.calls.some(call=>['started','unknown'].includes(call.status));
   await leases.withLease(ref,'settlement',async({tx,task})=>{if(task.status!=='running')return null;const [row]=await tx.update(executionTasks).set({status:pending?'unknown_result':scope.signal.aborted?'cancelled':'failed',leaseOwner:null,leaseExpiresAt:null,lastErrorCode:pending?'VIDEO_VISUAL_REVIEW_UNKNOWN':'VIDEO_VISUAL_REVIEW_STOPPED',updatedAt:now()}).where(eq(executionTasks.id,task.id)).returning();return row;}).then(row=>{if(row)observeCommittedTaskSettlement(db,{taskId:row.id,userId:row.userId,attempt:row.attempt,kind:row.kind,status:row.status,occurredAt:row.updatedAt});}).catch(()=>{});
   throw error;
  }
 };
 return {freezeParentDeadline,review,stop:()=>supervision.stop()};
}
