import {realpath} from 'node:fs/promises';
import {root} from '@openclaw/fs-safe/root';
import {isAbsolute,relative} from 'node:path';
import type {SessionNotification} from '@agentclientprotocol/sdk';
import {externalChatImageReceiptSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {z} from 'zod';
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const MAX=30*1024*1024;
export function imageMime(bytes:Uint8Array){
 const b=Buffer.from(bytes);
 if(b.length>MAX||b.length<12)throw Error('CODEX_IMAGE_INVALID');
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png' as const;
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg' as const;
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp' as const;
 throw Error('CODEX_IMAGE_INVALID');
}
export async function readTaskImage(cwd:string,path:string){
 if(!isAbsolute(path))throw Error('CODEX_IMAGE_PATH_UNSAFE');
 const directory=await realpath(cwd),local=relative(cwd,path);
 if(!local||local==='..'||local.startsWith('../')||local.startsWith('..\\')||isAbsolute(local))throw Error('CODEX_IMAGE_PATH_UNSAFE');
 // 复用客户端同源 fs-safe 根能力：限制字节、拒绝符号链接与硬链接，核验已打开文件归属。
 const workspace=await root(directory,{maxBytes:MAX,symlinks:'reject',hardlinks:'reject'});
 const bytes=await workspace.readBytes(local);imageMime(bytes);return bytes;
}
/** 同步通知只排队；宿主必须等待 flush 后才能结算，错误仅影响对应图片。 */
export function createExternalChatImages(input:{cwd:string;callId:string;sessionId:string;signal:AbortSignal;call:Call}){
 const images=new Map<string,z.infer<typeof externalChatImageReceiptSchema>>(),failures=new Map<string,{toolCallId:string;imageIndex:number;code:string}>();let tail=Promise.resolve();
 function accept(notification:SessionNotification){
  if(notification.sessionId!==input.sessionId)return;
  const update=object(notification.update);
  if(!['tool_call','tool_call_update'].includes(String(update.sessionUpdate))||typeof update.toolCallId!=='string'||update.status!=='completed')return;
  const blocks=Array.isArray(update.content)?update.content:[],candidates=blocks.map(item=>object(object(item).content)).filter(item=>item.type==='image');
  const path=object(update.rawOutput).savedPath;
  if(!candidates.length&&typeof path==='string')candidates.push({type:'image',savedPath:path});
  for(const [imageIndex,image] of candidates.slice(0,16).entries()){
   const toolCallId=update.toolCallId,key=JSON.stringify([toolCallId,imageIndex]);
   tail=tail.then(async()=>{
    if(images.has(key))return;
    if(images.size>=16){failures.set(key,{toolCallId,imageIndex,code:'CODEX_IMAGE_LIMIT'});return;}
    const identity={callId:input.callId,sessionId:input.sessionId,toolCallId,imageIndex};
    try{
     input.signal.throwIfAborted();
     const saved=object(await input.call('recoverExternalChatImage',identity,input.signal));
     if(saved.status==='committed'){images.set(key,externalChatImageReceiptSchema.parse(saved.receipt));failures.delete(key);return;}
     let bytes:Uint8Array;
     if(typeof image.data==='string'){
      if(image.data.length>Math.ceil(MAX/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(image.data))throw Error('CODEX_IMAGE_INVALID');bytes=Buffer.from(image.data,'base64');
     }else if(typeof image.savedPath==='string')bytes=await readTaskImage(input.cwd,image.savedPath);
     else throw Error('CODEX_IMAGE_INVALID');
     const receipt=object(await input.call('saveExternalChatImage',{...identity,mimeType:imageMime(bytes),bytes},input.signal));
     if(receipt.status!=='committed')throw Error('CODEX_IMAGE_SAVE_UNKNOWN');
     images.set(key,externalChatImageReceiptSchema.parse(receipt.receipt));failures.delete(key);
    }catch(error){const code=error instanceof Error&&['CODEX_IMAGE_INVALID','CODEX_IMAGE_PATH_UNSAFE'].includes(error.message)?error.message:'CODEX_IMAGE_SAVE_UNKNOWN';failures.set(key,{toolCallId,imageIndex,code});}
   });
  }
 }
 return {accept,async flush(){await tail;return {images:[...images.values()],imageFailures:[...failures.values()].slice(0,16)};}};
}
