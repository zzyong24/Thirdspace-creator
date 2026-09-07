import {transcribeWithLocalFallback} from '../runtime/transcribe-local-fallback';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {transcribeAsrPreparationSchema,transcribeAsrPlanSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {transcribeAudio,type MultimodalProviderRegistry} from '../runtime/multimodal-factory';
import {asrExecutionIdentity} from '../runtime/asr-execution-identity';
import {createDurableAsrRequestExecutor} from './durable-asr-request';
import {AsrExecutionInterruption} from '../runtime/asr-request';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const callReceipt=z.object({callId:z.string().min(1),status:z.enum(['reserved','started','settled','rejected','unknown']),result:z.object({text:z.string(),language:z.string().optional()}).strict().optional(),rejectionStatus:z.number().int().optional()}).strict();
const audioReceipt=z.object({status:z.literal('ready'),bytes:z.instanceof(Uint8Array),audioDigest:z.string(),audioByteLength:z.number().int().positive()}).strict();
/** 原音频已准备后的识别节点；先恢复正文，只有缺少完整回执才取得字节并调用适配器。 */
export async function runTranscribeAsrInWorker(awemeId:string,signal:AbortSignal,call:Call,registry:MultimodalProviderRegistry){
 signal.throwIfAborted();
 const controlled=async<T>(work:()=>Promise<T>):Promise<T>=>{try{const result=await work();signal.throwIfAborted();return result;}catch{signal.throwIfAborted();throw new AsrExecutionInterruption();}};
 let prepared=await controlled(async()=>transcribeAsrPreparationSchema.parse(await call('prepareTranscribeAsr',{awemeId},signal)));
 signal.throwIfAborted();
 const executeSelected=async(selected:z.infer<typeof transcribeAsrPreparationSchema>)=>{
 if(selected.status==='restored')return selected.result;
 const audio=await controlled(async()=>audioReceipt.parse(await call('readTranscribeAudio',{awemeId},signal)));
 signal.throwIfAborted();
 const bytes=Uint8Array.from(audio.bytes),digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
 await controlled(async()=>{if(bytes.byteLength!==selected.plan.audioByteLength||digest!==selected.plan.audioDigest||audio.audioDigest!==digest||audio.audioByteLength!==bytes.byteLength||!isDeepStrictEqual(asrExecutionIdentity(selected.spec,selected.plan.identity.language),selected.plan.identity))throw new AsrExecutionInterruption();});
 const executeRequest=createDurableAsrRequestExecutor({operationKey:`transcribe:${awemeId}`,signal,ports:{
  reserve:async({request})=>callReceipt.parse(await call('reserveAsrRequest',{awemeId,request},signal)),
  start:async callId=>{const receipt=callReceipt.parse(await call('startAsrRequest',{awemeId,callId},signal));if(receipt.callId!==callId||receipt.status!=='started')throw new AsrExecutionInterruption();},
  settle:async(callId,input)=>{const receipt=callReceipt.parse(await call('settleAsrRequest',{awemeId,callId,...input}));if(receipt.callId!==callId||(input.status!=='unknown'&&receipt.status!==input.status))throw new AsrExecutionInterruption();},
 }});
 const result=await transcribeAudio(selected.spec,{audioBytes:bytes,language:selected.plan.identity.language??undefined,signal,executeRequest},registry);
 signal.throwIfAborted();return result;
 };
 if(prepared.status==='restored'&&prepared.result.text.trim())return prepared.result;
 const initialSpec=prepared.status==='prepared'?prepared.spec:{kind:'audio' as const,provider:prepared.plan.identity.provider,model:prepared.plan.identity.model,baseUrl:null,token:''};
 const result=await transcribeWithLocalFallback(initialSpec,async current=>{
  if(current.provider==='whisper-local'&&prepared.plan.identity.protocol!=='whisper-local.v1'){
   const fallback=await controlled(async()=>transcribeAsrPlanSchema.parse(await call('selectTranscribeLocalFallback',{awemeId},signal)));
   if(fallback.identity.protocol!=='whisper-local.v1'||fallback.audioDigest!==prepared.plan.audioDigest||fallback.audioByteLength!==prepared.plan.audioByteLength)throw new AsrExecutionInterruption();
   const next=await controlled(async()=>transcribeAsrPreparationSchema.parse(await call('prepareTranscribeAsr',{awemeId},signal)));
   if(!isDeepStrictEqual(next.plan,fallback))throw new AsrExecutionInterruption();
   prepared=next;
  }
  return executeSelected(prepared);
 });
 signal.throwIfAborted();return result.transcript;
}
