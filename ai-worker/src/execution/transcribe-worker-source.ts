import {z} from 'zod';
import {setTimeout as delay} from 'node:timers/promises';
import {transcribeProfileSchema,transcribeSourceFailureSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {fetchDouyinVideoSource} from '../runtime/douyin-transcribe-source';
import path from 'node:path';
import {resolveDouyinProfileIdentity} from '../runtime/browser/profile-directory';
import {openDouyinProfileContext} from '../runtime/browser/douyin-profile-context';
import {fetchDouyinVideoUrlViaDetail} from '../runtime/douyin-transcribe-detail';
import {DouyinNotLoggedInError} from '../runtime/douyin-errors';
import {GenerationFailure} from './generation-error';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
/** 匿名与登录详情均由Worker执行；宿主只授权真实账号profile与共享请求网关。 */
export function createTranscribeWorkerSource(signal:AbortSignal,call:Call){
 const ack=z.object({ok:z.literal(true)}).strict();
 const invoke=async<T>(schema:z.ZodType<T>,port:WorkerPort,raw:unknown):Promise<T>=>{
  for(let attempt=0;attempt<3;attempt++){
   let response:unknown;
   try{response=await call(port,raw,signal);}catch{signal.throwIfAborted();throw new GenerationFailure('unknown_result','TRANSCRIBE_SOURCE_RECEIPT_UNKNOWN');}
   signal.throwIfAborted();const failure=transcribeSourceFailureSchema.safeParse(response);
   if(!failure.success){try{return schema.parse(response);}catch{throw new GenerationFailure('unknown_result','TRANSCRIBE_SOURCE_RECEIPT_UNKNOWN');}}
   const value=failure.data.sourceFailure;
   if(value.outcome==='waiting_user'||attempt===2)throw new GenerationFailure('waiting_user',value.errorCode);
   // 来源读取没有付费调用回执；有限本地等待不伪造rejected模型账本，仍受任务deadline取消。
   await delay(value.retryAfterMs??5000,undefined,{signal});
  }
  throw new GenerationFailure('waiting_user','TRANSCRIBE_SOURCE_UNAVAILABLE');
 };
 const channel=(awemeId:string,channel:'iesdouyin'|'creator-center')=>async<T>(run:()=>Promise<T>,mapError:(error:unknown)=>{kind:string})=>{
   await invoke(ack,'acquireTranscribeChannel',{awemeId,channel});
   let result;
   try{result=await run();}catch(error){
    signal.throwIfAborted();const failure=mapError(error);
    await invoke(ack,'reportTranscribeChannel',{awemeId,channel,result:failure});
    if(failure.kind==='captcha')throw new GenerationFailure('waiting_user','TRANSCRIBE_CAPTCHA_REQUIRED');
    throw error;
   }
   await invoke(ack,'reportTranscribeChannel',{awemeId,channel,result:{kind:'success'}});return result;
  };
 const fetchSource=(awemeId:string)=>fetchDouyinVideoSource({awemeId,authDir:'authorized-account-profile',signal},{
  channel:channel(awemeId,'iesdouyin'),
  fetchViaDetail:async()=>{
   const profile=await invoke(transcribeProfileSchema,'acquireTranscribeProfile',{awemeId});
   // SEMANTIC_BOUNDARY_ALLOW: 规范目录和摘要协议一致性，不作账号语义选择。
   const identity=await resolveDouyinProfileIdentity(path.dirname(profile.authDir),path.basename(profile.authDir),signal);
   if(identity.authDir!==profile.authDir||identity.profileKey!==profile.profileKey)throw new GenerationFailure('waiting_user','TRANSCRIBE_PROFILE_CHANGED');
   return fetchDouyinVideoUrlViaDetail({awemeId,signal},{
    openContext:()=>openDouyinProfileContext(identity.authDir,true,{signal}),
    channel:channel(awemeId,'creator-center'),
   });
  },
 });
 return async(awemeId:string)=>{
  for(let attempt=0;attempt<3;attempt++){
   try{return await fetchSource(awemeId);}catch(error){
    signal.throwIfAborted();if(error instanceof GenerationFailure)throw error;
    if(error instanceof DouyinNotLoggedInError)throw new GenerationFailure('waiting_user','TRANSCRIBE_LOGIN_REQUIRED');
    if(attempt===2)throw new GenerationFailure('waiting_user','TRANSCRIBE_SOURCE_UNAVAILABLE');
    await delay(1000*2**attempt,undefined,{signal});
   }
  }
  throw new GenerationFailure('waiting_user','TRANSCRIBE_SOURCE_UNAVAILABLE');
 };
}
