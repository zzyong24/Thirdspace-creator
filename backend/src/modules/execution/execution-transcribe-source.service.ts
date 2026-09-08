import type {z} from "zod";
import type {Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {workerPortInputSchemas,transcribeSourceFailureSchema,transcribeProfileSchema,type ExecutionRef,type WorkerPort} from '@creatoros/contract/execution-worker';
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
 const leases=createExecutionLeaseService(db,deps),profiles=createExecutionBrowserProfileLeaseService(db,deps);
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
   const failure=error as {name?:string;remainMs?:number};
   // SEMANTIC_BOUNDARY_ALLOW: 只识别已有资源错误类别，不判断用户意图或替换付费回执。
   return transcribeSourceFailureSchema.parse({sourceFailure:failure?.name==='DouyinNotLoggedInError'
    ?{outcome:'waiting_user',errorCode:'TRANSCRIBE_LOGIN_REQUIRED'}
    :{outcome:'retry_wait',errorCode:failure?.name==='DouyinCooldownActiveError'?'TRANSCRIBE_SOURCE_COOLDOWN':'TRANSCRIBE_SOURCE_UNAVAILABLE',retryAfterMs:typeof failure?.remainMs==='number'&&Number.isFinite(failure.remainMs)?Math.max(0,Math.min(2147483647,Math.ceil(failure.remainMs))):5000}});
  }
  await check();return port==='acquireTranscribeProfile'?output:{ok:true};
 }};
}
