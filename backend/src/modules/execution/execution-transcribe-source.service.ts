import type {z} from "zod";
import type {Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {workerPortInputSchemas,transcribeSourceSchema,type ExecutionRef,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createExecutionLeaseService} from './execution-lease.service';
import {bindTranscribeExecution} from './transcribe-execution-binding';
import {ConflictError} from './execution.errors';
export interface TranscribeSourceDeps {
 /** 仅原账号profile的登录详情窄桥；不得指向user/domain网页会话。原detail已含creator-center网关。 */
 fetchLoggedInSource(ctx:RequestContext,awemeId:string,signal?:AbortSignal):Promise<unknown>;
 acquireChannel(ctx:RequestContext,channel:'iesdouyin'|'creator-center',signal?:AbortSignal):Promise<unknown>;
 reportChannel(ctx:RequestContext,channel:'iesdouyin'|'creator-center',result:z.infer<typeof workerPortInputSchemas.reportTranscribeChannel>['result']):Promise<unknown>;
}
/** 资源授权与共享网关单独保留，不负责ASR或作品结果。 */
export function createExecutionTranscribeSourceService(db:Db,deps:TranscribeSourceDeps&{now?:()=>string}){
 const leases=createExecutionLeaseService(db,deps);
 return {async invoke(ref:ExecutionRef,port:WorkerPort,raw:unknown,signal?:AbortSignal){
  if(!['fetchLoggedInTranscribeSource','acquireTranscribeChannel','reportTranscribeChannel'].includes(port))throw new ConflictError('不是转写来源端口');
  const input=workerPortInputSchemas[port].parse(raw) as {awemeId:string;channel:'iesdouyin'|'creator-center';result:{kind:string;consecutiveTimeouts?:number}};
  const check=()=>leases.withLease(ref,'admission',async scope=>{await bindTranscribeExecution(scope,input.awemeId);signal?.throwIfAborted();return scope.context;});
  const ctx=await check();let output:unknown;
  if(port==='fetchLoggedInTranscribeSource')output=transcribeSourceSchema.parse(await deps.fetchLoggedInSource(ctx,input.awemeId,signal));
  else if(port==='acquireTranscribeChannel')output=await deps.acquireChannel(ctx,input.channel,signal);
  else output=await deps.reportChannel(ctx,input.channel,workerPortInputSchemas.reportTranscribeChannel.parse(raw).result);
  await check();return port==='fetchLoggedInTranscribeSource'?output:{ok:true};
 }};
}
