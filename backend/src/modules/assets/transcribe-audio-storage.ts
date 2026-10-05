import {requireWorkspace} from "@creatoros/backend";
import {createHash} from 'node:crypto';
import type {RequestContext} from '@creatoros/contract';
import type {ObjectStorageForCtx} from './assets.service';
import {transcribeAudioReceiptSchema} from '@creatoros/contract/execution-worker';
import {requireAccountId} from './assets.errors';
export const transcribeAudioDigest=(bytes:Uint8Array)=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
/** 领域内部音频存储端口；执行服务保存归属与 key，Worker 不传路径。 */
export function createTranscribeAudioStorage(objectStorageForCtx:ObjectStorageForCtx){
 return {
  async allocate(ctx:RequestContext,bytes:Uint8Array,signal?:AbortSignal){
   requireWorkspace(ctx);signal?.throwIfAborted();
   const storage=await objectStorageForCtx(ctx);signal?.throwIfAborted();
   const key=await storage.createPresignedUpload({accountId:ctx.accountId,groupId:ctx.groupId,assetType:'audio',mimeType:'audio/mpeg',fileSize:bytes.byteLength,folder:'execution-inputs',fileName:'transcribe.mp3'});signal?.throwIfAborted();
   return transcribeAudioReceiptSchema.parse({schemaVersion:1,state:'reserved',storageKey:key.storageKey,audioDigest:transcribeAudioDigest(bytes),audioByteLength:bytes.byteLength});
  },
  async read(ctx:RequestContext,raw:unknown,signal?:AbortSignal){
   const receipt=transcribeAudioReceiptSchema.parse(raw);signal?.throwIfAborted();const storage=await objectStorageForCtx(ctx);signal?.throwIfAborted();
   let bytes:Uint8Array;
   try{bytes=await storage.getObject(receipt.storageKey);}catch(error){
    signal?.throwIfAborted();const e=error as {code?:string;name?:string;$metadata?:{httpStatusCode?:number}};
    if(e?.code==='ENOENT'||e?.name==='NoSuchKey'||e?.$metadata?.httpStatusCode===404)return null;
    throw error;
   }
   signal?.throwIfAborted();if(bytes.byteLength!==receipt.audioByteLength||transcribeAudioDigest(bytes)!==receipt.audioDigest)throw new Error('已保存的转写音频不完整，不能重新提交 ASR');
   return Uint8Array.from(bytes);
  },
  async write(ctx:RequestContext,raw:unknown,bytes:Uint8Array,signal?:AbortSignal){
   const receipt=transcribeAudioReceiptSchema.parse(raw);signal?.throwIfAborted();
   if(bytes.byteLength!==receipt.audioByteLength||transcribeAudioDigest(bytes)!==receipt.audioDigest)throw new Error('音频与冻结输入不同');
   const storage=await objectStorageForCtx(ctx);signal?.throwIfAborted();
   await storage.putObject({storageKey:receipt.storageKey,bytes,mimeType:'audio/mpeg',assetType:'audio'});
  },
 };
}
