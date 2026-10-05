import type {RequestContext} from '@creatoros/contract';
import {localCodexStatusSchema,localCodexStatusRequestSchema,localCodexStatusResponseSchema} from '@creatoros/contract/execution-worker';
import {createRequestIoService} from './request-io.service';
import {localCodexWorkerEnv} from '../execution/local-codex-worker-env';
/** 状态诊断复用私有IO宿主，不创建创作任务，不读取认证文件。 */
export function createLocalCodexStatusService(deps:{entryPath:()=>string;timeoutMs?:number}){
 const io=createRequestIoService({...deps,extraEnv:localCodexWorkerEnv(),timeoutMs:deps.timeoutMs??25000,parseInput:input=>localCodexStatusRequestSchema.parse(input),parseResponse:raw=>localCodexStatusResponseSchema.parse(raw)});
 return {read:async(context:RequestContext,signal?:AbortSignal)=>{
  try{return localCodexStatusSchema.parse(await io.request(context,{type:'status'},signal));}
  catch{return localCodexStatusSchema.parse({engine:'codex',installed:false,available:false,version:null,loginStatus:'unchecked',errorCode:'CODEX_STATUS_UNAVAILABLE'});}
 },stop:()=>io.stop()};
}
