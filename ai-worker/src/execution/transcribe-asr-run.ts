import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {transcribeAsrPreparationSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
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
 const prepared=await controlled(async()=>transcribeAsrPreparationSchema.parse(await call('prepareTranscribeAsr',{awemeId},signal)));
 signal.throwIfAborted();
 if(prepared.status==='restored')return prepared.result;
 const audio=await controlled(async()=>audioReceipt.parse(await call('readTranscribeAudio',{awemeId},signal)));
 signal.throwIfAborted();
 const bytes=Uint8Array.from(audio.bytes),digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
 await controlled(async()=>{if(bytes.byteLength!==prepared.plan.audioByteLength||digest!==prepared.plan.audioDigest||audio.audioDigest!==digest||audio.audioByteLength!==bytes.byteLength||!isDeepStrictEqual(asrExecutionIdentity(prepared.spec,prepared.plan.identity.language),prepared.plan.identity))throw new AsrExecutionInterruption();});
 const executeRequest=createDurableAsrRequestExecutor({operationKey:`transcribe:${awemeId}`,signal,ports:{
  reserve:async({request})=>callReceipt.parse(await call('reserveAsrRequest',{awemeId,request},signal)),
  start:async callId=>{const receipt=callReceipt.parse(await call('startAsrRequest',{awemeId,callId},signal));if(receipt.callId!==callId||receipt.status!=='started')throw new AsrExecutionInterruption();},
  settle:async(callId,input)=>{const receipt=callReceipt.parse(await call('settleAsrRequest',{awemeId,callId,...input}));if(receipt.callId!==callId||(input.status!=='unknown'&&receipt.status!==input.status))throw new AsrExecutionInterruption();},
 }});
 const result=await transcribeAudio(prepared.spec,{audioBytes:bytes,language:prepared.plan.identity.language??undefined,signal,executeRequest},registry);
 signal.throwIfAborted();return result;
}
