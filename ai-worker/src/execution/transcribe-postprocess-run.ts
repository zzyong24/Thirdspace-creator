import {z} from 'zod';
import {transcribePostprocessPreparationSchema,transcribePostprocessReservationSchema,transcribePostprocessResultSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {modelFor} from '../runtime/provider-factory';
import {runTranscriptPostprocessRuntime} from '../runtime/transcript-postprocess';
import {createDurableGenerationModel} from './durable-generation-model';
import {GenerationFailure} from './generation-error';

type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const receiptSchema=z.object({callId:z.string().min(1),status:z.enum(['started','settled','rejected','unknown'])}).strict();
class PostprocessSkipped extends Error {}
const unknown=()=>new GenerationFailure('unknown_result','TRANSCRIPT_POSTPROCESS_RECEIPT_UNKNOWN');

/** 后处理只消费已冻结 ASR 原文；最终结果由后端回执回放确定，不提交 Worker 自报正文。 */
export async function runTranscribePostprocessInWorker(awemeId:string,signal:AbortSignal,call:Call){
 signal.throwIfAborted();
 const controlled=async<T>(work:()=>Promise<T>):Promise<T>=>{
  try{const value=await work();signal.throwIfAborted();return value;}
  catch{signal.throwIfAborted();throw unknown();}
 };
 const prepared=await controlled(async()=>transcribePostprocessPreparationSchema.parse(await call('prepareTranscribePostprocess',{awemeId},signal)));
 if(prepared.status==='restored')return prepared.result;
 if(!prepared.plan.identity)throw unknown();
 const model=createDurableGenerationModel({model:modelFor(prepared.spec),operationKey:prepared.plan.operationKey,signal,ports:{
  async reserve(input){
   const receipt=await controlled(async()=>transcribePostprocessReservationSchema.parse(await call('reserveTranscribePostprocess',JSON.parse(JSON.stringify({awemeId,...input})),signal)));
   // 后端已保存调用前预算降级；让可选校正结束，再通过同一保存端口回读。
   if(receipt.status==='skipped')throw new PostprocessSkipped();
   return receipt;
  },
  async start(callId){
   await controlled(async()=>{const receipt=receiptSchema.parse(await call('startTranscribePostprocess',{awemeId,callId},signal));if(receipt.callId!==callId||receipt.status!=='started')throw unknown();});
  },
  async settle(callId,input){
   // 取消仍允许结算真实已发生调用；不能给 settlement 传 admission signal。
   try{const receipt=receiptSchema.parse(await call('settleTranscribePostprocess',{awemeId,callId,...input}));if(receipt.callId!==callId||receipt.status!==input.status)throw unknown();}
   catch{throw unknown();}
  },
 }});
 await runTranscriptPostprocessRuntime(prepared.spec,{...prepared.plan,signal},{model});
 signal.throwIfAborted();
 return controlled(async()=>transcribePostprocessResultSchema.parse(await call('saveTranscribePostprocess',{awemeId},signal)));
}
