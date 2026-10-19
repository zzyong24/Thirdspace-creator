import {z} from "zod";
import {desc,eq,aiTaskSteps,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {workerPortInputSchemas,transcribeSourceFailureSchema,transcribeProfileSchema,transcribeItemReceiptSchema,type ExecutionRef,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createExecutionLeaseService} from './execution-lease.service';
import {bindTranscribeExecution} from './transcribe-execution-binding';
import {createExecutionBrowserProfileLeaseService} from './execution-browser-profile-lease.service';
import {ConflictError} from './execution.errors';
export interface TranscribeSourceDeps {
 /** 从当前真实账号解析规范目录，不能使用user/domain网页会话。 */
 resolveProfile(ctx:RequestContext,signal?:AbortSignal):Promise<{authDir:string;profileKey:string}>;
 acquireChannel(ctx:RequestContext,channel:'iesdouyin'|'creator-center',signal?:AbortSignal):Promise<unknown>;
 reportChannel(ctx:RequestContext,channel:'iesdouyin'|'creator-center',result:z.infer<typeof workerPortInputSchemas.reportTranscribeChannel>['result']):Promise<unknown>;
}
/** 资源授权与共享网关单独保留，不负责ASR或作品结果。 */
export function createExecutionTranscribeSourceService(db:Db,deps:TranscribeSourceDeps&{now?:()=>string}){
 const now=deps.now??(()=>new Date().toISOString());
 const leases=createExecutionLeaseService(db,{now}),profiles=createExecutionBrowserProfileLeaseService(db,deps);
 return {async invoke(ref:ExecutionRef,port:WorkerPort,raw:unknown,signal?:AbortSignal){
  if(!['acquireTranscribeProfile','acquireTranscribeChannel','reportTranscribeChannel'].includes(port))throw new ConflictError('不是转写来源端口');
  const input=workerPortInputSchemas[port].parse(raw) as {awemeId:string;channel:'iesdouyin'|'creator-center';result:{kind:string;consecutiveTimeouts?:number}};
  const check=()=>leases.withLease(ref,'admission',async scope=>{await bindTranscribeExecution(scope,input.awemeId);signal?.throwIfAborted();return scope.context;});
  const ctx=await check();let output:unknown;
  try{
  if(port==='acquireTranscribeProfile'){
   const profile=await deps.resolveProfile(ctx,signal);await check();
   const receipt=await profiles.acquireProfile(ref,'douyin.com',profile.profileKey);
   // 租约从此由dispatcher整树停止证明释放，回执丢失也不能抢占目录。
   output=transcribeProfileSchema.parse({...profile,leaseId:receipt.leaseId});
  }
  else if(port==='acquireTranscribeChannel')output=await deps.acquireChannel(ctx,input.channel,signal);
  else output=await deps.reportChannel(ctx,input.channel,workerPortInputSchemas.reportTranscribeChannel.parse(raw).result);
  }catch(error){
   signal?.throwIfAborted();await check();
   if(error instanceof ConflictError || (error&&typeof error==='object'&&(error as {name?:string}).name==='ZodError'))throw error;
   const failure=error as {name?:string;remainMs?:number;channel?:unknown};
   // SEMANTIC_BOUNDARY_ALLOW: 只识别已有资源错误类别，不判断用户意图或替换付费回执。
   const receipt=transcribeSourceFailureSchema.parse({sourceFailure:failure?.name==='DouyinNotLoggedInError'
    ?{outcome:'waiting_user',errorCode:'TRANSCRIBE_LOGIN_REQUIRED'}
    :{outcome:'retry_wait',errorCode:failure?.name==='DouyinCooldownActiveError'?'TRANSCRIBE_SOURCE_COOLDOWN':'TRANSCRIBE_SOURCE_UNAVAILABLE',retryAfterMs:typeof failure?.remainMs==='number'&&Number.isFinite(failure.remainMs)?Math.max(0,Math.min(2147483647,Math.ceil(failure.remainMs))):5000}});
   // 仅记真实同来源的首次冷却事实；typed分类及响应保持原语义。
   if(port==='acquireTranscribeChannel'&&receipt.sourceFailure.errorCode==='TRANSCRIBE_SOURCE_COOLDOWN'&&failure.channel===input.channel&&typeof failure.remainMs==='number'&&Number.isFinite(failure.remainMs)&&failure.remainMs>0){
    await leases.withLease(ref,'admission',async scope=>{
     const state=await bindTranscribeExecution(scope,input.awemeId);signal?.throwIfAborted();
     // 外部acquire可能晚回；原已确认作品完成后不追加旧等待说明，不触碰payload或typed回执。
     const saved=z.record(z.string(),z.unknown()).parse(state.payload.transcribeItems??{});
     const previous=Object.hasOwn(saved,input.awemeId)?transcribeItemReceiptSchema.parse(saved[input.awemeId]):null;
     if(previous&&previous.awemeId!==input.awemeId)throw new ConflictError('转写作品回执与原来源不符');
     if(previous&&previous.status!=='failed')return;
     const id=`transcribe-cooldown:${scope.task.id}:${ref.attempt}:${input.awemeId}:${input.channel}`;
     const [existing]=await scope.tx.select({id:aiTaskSteps.id,aiTaskId:aiTaskSteps.aiTaskId}).from(aiTaskSteps).where(eq(aiTaskSteps.id,id)).limit(1);
     signal?.throwIfAborted();
     if(existing){if(existing.aiTaskId!==state.business.id)throw new ConflictError('冷却步骤与原任务归属不符');return;}
     // 与workflow沿同执行行锁按新步骤单调追加，旧步骤不重排。
     const [last]=await scope.tx.select({stepNo:aiTaskSteps.stepNo}).from(aiTaskSteps).where(eq(aiTaskSteps.aiTaskId,state.business.id)).orderBy(desc(aiTaskSteps.stepNo)).limit(1);
     const assertCurrentTime=()=>{
      signal?.throwIfAborted();const stamp=now(),at=Date.parse(stamp);
      if(scope.task.status!=='running'||!scope.task.leaseOwner||!scope.task.leaseExpiresAt||!(Date.parse(scope.task.leaseExpiresAt)>at)||(scope.task.deadlineAt!==null&&!(Date.parse(scope.task.deadlineAt)>at)))throw new ConflictError('当前执行已停止或租约到期，不能启动新动作');
      return stamp;
     };
     const stamp=assertCurrentTime();
     await scope.tx.insert(aiTaskSteps).values({id,aiTaskId:state.business.id,stepNo:(last?.stepNo??0)+1,kind:'step',text:`作品 ${state.input.awemeIds.indexOf(input.awemeId)+1}：当时抖音来源限流冷却。`,toolCalls:[],createdAt:stamp}).onConflictDoNothing({target:aiTaskSteps.id});
     // 插入等待期间取消或跨原期限则回滚本事务；不把数据库/控制错误降成普通来源失败。
     assertCurrentTime();
    });
   }
   return receipt;
  }
  await check();return port==='acquireTranscribeProfile'?output:{ok:true};
 }};
}
