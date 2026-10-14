import {createHash} from 'node:crypto';
import {isCanonicalBase64} from '@creatoros/contract/agent-workbench';
import {externalChatImageReceiptSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import type {NativeTurnResult} from './codex-native-turn';
import {imageMime} from './external-chat-images';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
/** 原生 imageGeneration item 的真实字节经原资产端口保存；item ID 不冒称 dynamic tool。 */
export async function saveNativeChatImages(result:NativeTurnResult,callId:string,signal:AbortSignal,call:Call,protocol:'acp'|'codex-app-server'='codex-app-server'){
 const images:Array<typeof externalChatImageReceiptSchema._output>=[],imageFailures:Array<{toolCallId:string;imageIndex:number;code:string}>=[];
 for(const image of (result.images??[]).slice(0,16)){
  try{
   signal.throwIfAborted();if(image.base64.length>41943040||!isCanonicalBase64(image.base64))throw Error('CODEX_IMAGE_INVALID');
   const bytes=Buffer.from(image.base64,'base64'),mimeType=imageMime(bytes),nativeSource={providerTurnId:result.providerTurnId,itemId:image.id,checksum:createHash('sha256').update(bytes).digest('hex')},identity={callId,sessionId:result.sessionId,toolCallId:image.id,imageIndex:0,...(protocol==='codex-app-server'?{nativeSource}:{})};
   let saved=await call('recoverExternalChatImage',identity,signal) as {status:string;receipt?:unknown};
   if(saved.status!=='committed')saved=await call('saveExternalChatImage',{...identity,mimeType,bytes},signal) as typeof saved;
   if(saved.status!=='committed')throw Error('CODEX_IMAGE_SAVE_UNKNOWN');
   const receipt=externalChatImageReceiptSchema.parse(saved.receipt);
   if(receipt.toolCallId!==image.id||receipt.imageIndex!==0||(protocol==='codex-app-server'&&(receipt.nativeSource?.providerTurnId!==result.providerTurnId||receipt.nativeSource.itemId!==image.id))||receipt.checksum!==nativeSource.checksum)throw Error('CODEX_IMAGE_SAVE_UNKNOWN');
   images.push(receipt);
  }catch(error){signal.throwIfAborted();imageFailures.push({toolCallId:image.id,imageIndex:0,code:error instanceof Error&&error.message==='CODEX_IMAGE_INVALID'?'CODEX_IMAGE_INVALID':'CODEX_IMAGE_SAVE_UNKNOWN'});}
 }
 return {images,imageFailures};
}
