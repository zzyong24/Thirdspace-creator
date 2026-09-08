import {z} from 'zod';
import {transcribeSourceSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {fetchDouyinVideoSource} from '../runtime/douyin-transcribe-source';
import {GenerationFailure} from './generation-error';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
/** 匿名取流属于 Worker；原账号登录 profile 尚由真实宿主详情桥持有，不能换成网页会话冒充。 */
export function createTranscribeWorkerSource(signal:AbortSignal,call:Call){
 const ack=z.object({ok:z.literal(true)}).strict();
 const invoke=async<T>(schema:z.ZodType<T>,port:WorkerPort,raw:unknown)=>{try{const value=schema.parse(await call(port,raw,signal));signal.throwIfAborted();return value;}catch{signal.throwIfAborted();throw new GenerationFailure('unknown_result','TRANSCRIBE_SOURCE_RECEIPT_UNKNOWN');}};
 return (awemeId:string)=>fetchDouyinVideoSource({awemeId,authDir:'host-account-profile',signal},{
  async channel(run,mapError){
   await invoke(ack,'acquireTranscribeChannel',{awemeId,channel:'iesdouyin'});
   let result;
   try{result=await run();}catch(error){signal.throwIfAborted();await invoke(ack,'reportTranscribeChannel',{awemeId,channel:'iesdouyin',result:mapError(error)});throw error;}
   await invoke(ack,'reportTranscribeChannel',{awemeId,channel:'iesdouyin',result:{kind:'success'}});return result;
  },
  fetchViaDetail:()=>invoke(transcribeSourceSchema,'fetchLoggedInTranscribeSource',{awemeId}),
 });
}
