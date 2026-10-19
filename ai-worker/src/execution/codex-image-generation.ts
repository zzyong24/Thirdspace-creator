import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createControlledCodexSession,CodexHostError} from './codex-app-server';
import {runCodexNativeTurn,recoverCodexNativeTurn} from './codex-native-turn';
import {imageMime,readTaskImage} from './external-chat-images';
import type {CodexWorkerCall} from './codex-call-context';
export async function generateCodexImage(input:{prompt:string;aspectRatio?:string;requestedModel?:string},callId:string,signal:AbortSignal,call:CodexWorkerCall,recover=false,reference?:{bytes:Uint8Array;mimeType:string}){
 const cwd=await mkdtemp(join(tmpdir(),'creatoros-codex-image-'));
 let session:Awaited<ReturnType<typeof createControlledCodexSession>>|undefined;
 try{
  session=await createControlledCodexSession(cwd,signal,undefined,true);
  if(!session.authenticated)throw new CodexHostError('CODEX_LOGIN_REQUIRED');
  const binding=recover?await call('readCodexCall',{callId},signal) as {threadId?:string;turnId?:string;nativeResult?:{itemId:string;checksum:string;model:string|null;usage:import("./codex-native-turn").NativeTurnResult["usage"]}}|null:null;
  const result=recover?await recoverCodexNativeTurn(session.rpc,binding?.threadId??'',binding?.turnId):await runCodexNativeTurn({rpc:session.rpc,mcpNames:session.mcpNames,cwd,signal,tools:[],...(input.requestedModel?{model:input.requestedModel}:{}),
   prompt:`请使用内置 image_gen.imagegen 生成且只生成一张最终图片。画幅要求：${input.aspectRatio??'按描述选择'}。完整创作要求：\n${input.prompt}`,
   ...(reference?{images:[{url:`data:${reference.mimeType};base64,${Buffer.from(reference.bytes).toString('base64')}`}]}:{}),
   onThread:async threadId=>{await call('bindCodexCall',{callId,threadId},signal);},onTurn:async turnId=>{await call('bindCodexCall',{callId,turnId},signal);},onAdmission:async()=>{},onUsage:async usage=>{const bound=await call('bindCodexCall',{callId,observedUsage:{inputTokens:usage.inputTokens??undefined,outputTokens:usage.outputTokens??undefined,totalTokens:usage.totalTokens??undefined}}) as {budgetExceeded?:boolean};return bound.budgetExceeded===true;},onTool:async()=>{throw new CodexHostError('CODEX_EXTERNAL_TOOL_UNAVAILABLE');}});
  if(result.images?.length!==1)throw new CodexHostError('CODEX_IMAGE_RESULT_UNKNOWN');
  const image=result.images[0]!;
  if(image.base64.length>Math.ceil(30*1024*1024/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64))throw new CodexHostError('CODEX_IMAGE_INVALID');
  const bytes=Buffer.from(image.base64,'base64');imageMime(bytes);
  const path=join(cwd,'result-image');await writeFile(path,bytes,{mode:0o600,flag:'wx'});
  const checksum=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if(binding?.nativeResult&&(binding.nativeResult.itemId!==image.id||binding.nativeResult.checksum!==checksum))throw new CodexHostError('CODEX_IMAGE_RECOVERY_MISMATCH');
  await call('bindCodexCall',{callId,nativeResult:binding?.nativeResult??{itemId:image.id,checksum,model:result.model??null,usage:result.usage}});
  return {assetBytes:await readTaskImage(cwd,path),native:{threadId:result.sessionId,turnId:result.providerTurnId,itemId:image.id,model:result.model??null,usage:result.usage}};
 }finally{await session?.rpc.close();await rm(cwd,{recursive:true,force:true});}
}
