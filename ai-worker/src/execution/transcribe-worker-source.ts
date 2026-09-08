import {z} from 'zod';
import {setTimeout as delay} from 'node:timers/promises';
import {transcribeSourceSchema,transcribeSourceFailureSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {fetchDouyinVideoSource} from '../runtime/douyin-transcribe-source';
import {GenerationFailure} from './generation-error';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
/** 匿名取流属于 Worker；原账号登录 profile 尚由真实宿主详情桥持有，不能换成网页会话冒充。 */
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
 const fetchSource=(awemeId:string)=>fetchDouyinVideoSource({awemeId,authDir:'host-account-profile',signal},{
  async channel(run,mapError){
   await invoke(ack,'acquireTranscribeChannel',{awemeId,channel:'iesdouyin'});
   let result;
   try{result=await run();}catch(error){signal.throwIfAborted();await invoke(ack,'reportTranscribeChannel',{awemeId,channel:'iesdouyin',result:mapError(error)});throw error;}
   await invoke(ack,'reportTranscribeChannel',{awemeId,channel:'iesdouyin',result:{kind:'success'}});return result;
  },
  fetchViaDetail:()=>invoke(transcribeSourceSchema,'fetchLoggedInTranscribeSource',{awemeId}),
 });
 return async(awemeId:string)=>{
  for(let attempt=0;attempt<3;attempt++){
   try{return await fetchSource(awemeId);}catch(error){
    signal.throwIfAborted();if(error instanceof GenerationFailure)throw error;
    if(attempt===2)throw new GenerationFailure('waiting_user','TRANSCRIBE_SOURCE_UNAVAILABLE');
    await delay(1000*2**attempt,undefined,{signal});
   }
  }
  throw new GenerationFailure('waiting_user','TRANSCRIBE_SOURCE_UNAVAILABLE');
 };
}
