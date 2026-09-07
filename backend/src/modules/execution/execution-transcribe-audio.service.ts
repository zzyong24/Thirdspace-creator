import {eq,executionTasks,executionCalls,type Db} from '@creatoros/backend';
import {transcribeAudioReceiptSchema,workerPortInputSchemas,type ExecutionRef,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createTranscribeAudioStorage,transcribeAudioDigest} from '../assets/transcribe-audio-storage';
import type {ObjectStorageForCtx} from '../assets/assets.service';
import {bindTranscribeExecution,type TranscribeExecutionScope} from './transcribe-execution-binding';
import {createExecutionLeaseService} from './execution-lease.service';
import {ConflictError} from './execution.errors';
import type {z} from 'zod';
type Receipt=z.infer<typeof transcribeAudioReceiptSchema>;
/** 原音频先写入存储再确认可用；指针与归属保留在原执行任务，不建立新队列。 */
export function createExecutionTranscribeAudioService(db:Db,deps:{objectStorageForCtx:ObjectStorageForCtx;now?:()=>string}){
 const leases=createExecutionLeaseService(db,deps),storage=createTranscribeAudioStorage(deps.objectStorageForCtx);
 async function bound(scope:TranscribeExecutionScope,awemeId:string){
  const {payload}=await bindTranscribeExecution(scope,awemeId),raw=payload.transcribeAudioInputs;
  if(raw!==undefined&&(!raw||typeof raw!=='object'||Array.isArray(raw)))throw new ConflictError('原音频快照记录损坏');
  const inputs=(raw??{}) as Record<string,unknown>,record=Object.hasOwn(inputs,awemeId)?transcribeAudioReceiptSchema.parse(inputs[awemeId]):null;
  if(!record){
   const manifests=payload.asrAudioManifests;
   const calls=await scope.tx.select({operationKey:executionCalls.operationKey}).from(executionCalls).where(eq(executionCalls.executionTaskId,scope.task.id));
   if((manifests&&typeof manifests==='object'&&Object.hasOwn(manifests,awemeId))||calls.some(call=>call.operationKey.startsWith(`transcribe:${awemeId}/asr/`)))throw new ConflictError('已有 ASR 执行缺少原音频，不能重新取流');
  }
  return {payload,inputs,record};
 }
 const same=(a:Receipt,b:Receipt)=>a.storageKey===b.storageKey&&a.audioDigest===b.audioDigest&&a.audioByteLength===b.audioByteLength;
 async function ready(ref:ExecutionRef,awemeId:string,expected:Receipt,mode:'admission'|'settlement'){
  return leases.withLease(ref,mode,async scope=>{
   const {payload,inputs,record}=await bound(scope,awemeId);
   if(!record||!same(record,expected))throw new ConflictError('原音频快照已改变');
   if(record.state!=='ready')await scope.tx.update(executionTasks).set({payload:{...payload,transcribeAudioInputs:{...inputs,[awemeId]:{...record,state:'ready'}}}}).where(eq(executionTasks.id,scope.task.id));
  });
 }
 const service={
  async read(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const {awemeId}=workerPortInputSchemas.readTranscribeAudio.parse(raw);signal?.throwIfAborted();
   const snapshot=await leases.withLease(ref,'admission',async scope=>({context:scope.context,...await bound(scope,awemeId)}));
   signal?.throwIfAborted();if(!snapshot.record)return {status:'missing' as const};
   const bytes=await storage.read(snapshot.context,snapshot.record,signal);
   if(!bytes){if(snapshot.record.state==='ready')throw new ConflictError('原转写音频已缺失，不能重复取流覆盖');return {status:'missing' as const};}
   await ready(ref,awemeId,snapshot.record,'admission');signal?.throwIfAborted();
   return {status:'ready' as const,bytes,audioDigest:snapshot.record.audioDigest,audioByteLength:snapshot.record.audioByteLength};
  },
  async save(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const input=workerPortInputSchemas.saveTranscribeAudio.parse(raw),bytes=Uint8Array.from(input.bytes),awemeId=input.awemeId,digest=transcribeAudioDigest(bytes);signal?.throwIfAborted();
   const initial=await leases.withLease(ref,'admission',async scope=>({context:scope.context,...await bound(scope,awemeId)}));
   signal?.throwIfAborted();
   const prepared=initial.record??await storage.allocate(initial.context,bytes,signal);
   const record=await leases.withLease(ref,'admission',async scope=>{
    signal?.throwIfAborted();const {payload,inputs,record}=await bound(scope,awemeId),chosen=record??prepared;
    if(chosen.audioDigest!==digest||chosen.audioByteLength!==bytes.byteLength)throw new ConflictError('不能用新音频替换原转写输入');
    if(!record)await scope.tx.update(executionTasks).set({payload:{...payload,transcribeAudioInputs:{...inputs,[awemeId]:chosen}}}).where(eq(executionTasks.id,scope.task.id));
    return chosen;
   });
   signal?.throwIfAborted();
   let saved=await storage.read(initial.context,record,signal);
   if(!saved){
    if(record.state==='ready')throw new ConflictError('已确认原音频缺失，不能覆盖');
    await leases.withLease(ref,'admission',async scope=>{const current=await bound(scope,awemeId);if(!current.record||!same(current.record,record))throw new ConflictError('音频预留已改变');});
    signal?.throwIfAborted();await storage.write(initial.context,record,bytes,signal);
    // put 的 ACK 不足以证明可回读；校验实际对象再确认 ready。
    saved=await storage.read(initial.context,record);
    if(!saved)throw new ConflictError('转写音频尚未可靠保存');
   }
   await ready(ref,awemeId,record,'settlement');signal?.throwIfAborted();
   return {audioDigest:record.audioDigest,audioByteLength:record.audioByteLength};
  },
  async invoke(ref:ExecutionRef,port:WorkerPort,raw:unknown,signal?:AbortSignal){
   if(port==='readTranscribeAudio')return service.read(ref,raw,signal);
   if(port==='saveTranscribeAudio')return service.save(ref,raw,signal);
   throw new ConflictError('不是原音频存储端口');
  },
 };
 return service;
}
