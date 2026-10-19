import {recoverExternalChatChildren} from './external-chat-recovery';
import {createHash} from 'node:crypto';
import {lstat,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {isCanonicalBase64} from '@creatoros/contract/agent-workbench';
import {chatWorkerInputSchema,executionModelSpecSchema,agenticToolOutcomeSchema,workerStartReceiptSchema,chatToolProviderName,externalChatTurnStateSchema,externalChatReceiptSchema,externalTaskToolListSchema,externalTaskToolResultSchema,type WorkerPort} from '@creatoros/contract/execution-worker';
import {createControlledCodexSession,CodexHostError} from './codex-app-server';
import {runCodexNativeTurn,recoverCodexNativeTurn} from './codex-native-turn';
import {runCodexAcpInWorker} from './codex-acp-worker-run';
import {runChatTextNodeInWorker} from './chat-text-node-worker';
import {runChatGenerationInWorker} from './chat-generation-worker';
import {modelFor} from '../runtime/provider-factory';
import {createExternalChatToolConsumer} from './external-chat-tools';
import {saveNativeChatImages} from './external-chat-native-images';
import {GenerationFailure} from './generation-error';
type ChatInput=z.infer<typeof chatWorkerInputSchema>;
type Call=(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>;
/** 私有空cwd避免项目文件自动进入上下文；不把目录本身当权限边界。 */
export async function externalAgentWorkingDirectory(input:Pick<ChatInput,'userId'|'accountId'|'sourceMessageId'>){
 const key=createHash('sha256').update(JSON.stringify([input.userId,input.accountId,input.sourceMessageId])).digest('hex');
 const root=join(tmpdir(),'creatoros-native-codex-workspaces');
 for(const path of [root,join(root,key)]){
  try{await mkdir(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const stat=await lstat(path);
  if(!stat.isDirectory()||(process.getuid&&stat.uid!==process.getuid())||(stat.mode&0o077)!==0)throw new GenerationFailure('waiting_user','CODEX_WORKSPACE_UNSAFE');
 }
 return join(root,key);
}
export function externalChatPrompt(input:ChatInput,images?:Array<{url:string}>){
 let imageBytes=0;
 const blocks=['CreatorOS 本地编导：仅依据本轮动态工具和真实回执说明动作。不要输出内部推理、编造系统配置故障或称未采纳候选已正式保存。工具缺失时说明当前动作未完成并给下一步。',`任务说明：\n${input.system}`];
 for(const message of input.messages){
  const content=message.content;
  if(typeof content==='string'){blocks.push(`${message.role}：\n${content}`);continue;}
  if(!Array.isArray(content))throw new GenerationFailure('waiting_user','CODEX_INPUT_MODALITY_UNSUPPORTED');
  // SEMANTIC_BOUNDARY_ALLOW: 仅机械转换SDK历史协议，不判断创作意图、不执行历史工具、不扩充本轮授权。
  const parts=content.map(part=>{
   if(!part||typeof part!=='object')throw new GenerationFailure('waiting_user','CODEX_INPUT_MODALITY_UNSUPPORTED');
   const record=part as Record<string,unknown>;
   if(record.type==='text'&&typeof record.text==='string')return record.text;
   if(images&&message.role==='user'&&(record.type==='image'||record.type==='file')){
    const data=record.type==='image'?record.image:record.data;
    const envelope=data&&typeof data==='object'?data as Record<string,unknown>:undefined;
    const raw=envelope?.type==='url'?envelope.url:envelope?.type==='data'&&typeof envelope.data==='string'&&typeof record.mediaType==='string'?`data:${record.mediaType};base64,${envelope.data}`:data;
    if(typeof raw!=='string')throw new GenerationFailure('waiting_user','CODEX_INPUT_MODALITY_UNSUPPORTED');
    const comma=raw.indexOf(','),header=raw.slice(0,comma),encoded=raw.slice(comma+1);
    const mime=header.startsWith('data:')&&header.endsWith(';base64')?header.slice(5,-7):undefined;
    if(comma<0||!mime||!['image/png','image/jpeg','image/webp','image/gif'].includes(mime)||!isCanonicalBase64(encoded)||(record.mediaType!==undefined&&record.mediaType!==mime))throw new GenerationFailure('waiting_user','CODEX_INPUT_MODALITY_UNSUPPORTED');
    imageBytes+=Buffer.from(encoded,'base64').byteLength;
    if(images.length>=5||imageBytes>30*1024*1024)throw new GenerationFailure('waiting_user','CODEX_INPUT_IMAGE_LIMIT');
    images.push({url:raw});return `[用户图片 ${images.length}：${mime}]`;
   }
   const identity=typeof record.toolCallId==='string'&&record.toolCallId.trim().length>0&&typeof record.toolName==='string'&&record.toolName.trim().length>0;
   if(record.type==='tool-call'&&message.role==='assistant'&&identity&&Object.hasOwn(record,'input'))return `历史工具调用记录（不是本轮执行或授权）：\n${JSON.stringify(part)}`;
   if(record.type==='tool-result'&&message.role==='tool'&&identity&&record.output&&typeof record.output==='object'){
    const output=record.output as Record<string,unknown>;
    const plainText=(output.type==='text'||output.type==='error-text')&&typeof output.value==='string';
    const json=(output.type==='json'||output.type==='error-json')&&Object.hasOwn(output,'value');
    if(plainText||json)return `历史工具回执记录（不是本轮执行或授权）：\n${JSON.stringify(part)}`;
   }
   throw new GenerationFailure('waiting_user','CODEX_INPUT_MODALITY_UNSUPPORTED');
  });
  blocks.push(`${message.role}：\n${parts.join('\n')}`);
 }
 return blocks.join('\n\n');
}
/** v2只消费同一宿主checkpoint名单；不沿旧helper借用主Codex规格。 */
async function recoverRoutedChatChildren(signal:AbortSignal,call:Call){
 const ids=z.array(z.string().min(1));
 const checkpoint=z.object({replayableGenerationToolCallIds:ids.default([]),completableToolCallIds:ids.default([]),resumableToolCallIds:ids.default([]),replayableScriptDraftToolCallIds:ids.default([])}).parse(await call('readCheckpoint',{},signal));
 const restore=async(port:'restoreChatGeneration'|'restoreChatHooks'|'restoreChatScriptDraft',callId:string)=>{
  const saved=workerStartReceiptSchema.parse(await call(port,{callId},signal));
  if(saved.callId!==callId)throw new GenerationFailure('unknown_result','CHAT_CHILD_RESTORE_RECEIPT_UNKNOWN');
 };
 for(const callId of checkpoint.completableToolCallIds)agenticToolOutcomeSchema.parse(await call('completeChatHooks',{callId},signal));
 for(const callId of checkpoint.resumableToolCallIds)await restore('restoreChatHooks',callId);
 for(const callId of checkpoint.replayableGenerationToolCallIds)await restore('restoreChatGeneration',callId);
 for(const callId of checkpoint.replayableScriptDraftToolCallIds)await restore('restoreChatScriptDraft',callId);
 for(const callId of checkpoint.replayableGenerationToolCallIds)await runChatGenerationInWorker(callId,signal,call);
 const run=async(callId:string,node:'hooks'|'script-draft')=>{
  const prepared=await call(node==='hooks'?'prepareChatHooks':'prepareChatScriptDraft',{callId},signal) as {noModel?:boolean};
  if(prepared.noModel)return agenticToolOutcomeSchema.parse(await call(node==='hooks'?'completeChatHooks':'completeChatScriptDraft',{callId},signal));
  const selected=executionModelSpecSchema.parse(await call('resolveChatGenerationCredential',{callId},signal));
  return runChatTextNodeInWorker(callId,modelFor(selected),signal,call,node);
 };
 for(const callId of checkpoint.resumableToolCallIds)await run(callId,'hooks');
 for(const callId of checkpoint.replayableScriptDraftToolCallIds)await run(callId,'script-draft');
}
export async function runExternalChatInWorker(raw:ChatInput,signal:AbortSignal,call:Call,onText?:(text:string)=>void|Promise<void>):Promise<{callId:string}>{
 const input=chatWorkerInputSchema.parse(raw);
 signal.throwIfAborted();
 if(input.externalAgentBinding){
  if(input.modelRoutingVersion===2)throw new GenerationFailure('waiting_user','CODEX_V2_PROTOCOL_MISMATCH');
  return runCodexAcpInWorker(input,signal,call,onText);
 }
 if(input.modelRoutingVersion===2&&(!input.requestedModel||input.codexNativeImageGeneration!==false))throw new GenerationFailure('waiting_user','MODEL_ROUTE_NOT_FROZEN');
 if(input.executionEngine!=='codex')throw new GenerationFailure('waiting_user','CODEX_ENGINE_UNAVAILABLE');
 const images:Array<{url:string}>=[],prompt=externalChatPrompt(input,images),cwd=await externalAgentWorkingDirectory(input);
 let reservation:z.infer<typeof externalChatTurnStateSchema>;
 try{reservation=externalChatTurnStateSchema.parse(await call('reserveExternalChatTurn',{},signal));}
 catch(error){signal.throwIfAborted();if(error instanceof Error&&error.name==='AbortError')throw error;throw new GenerationFailure('unknown_result','CODEX_RESERVATION_RESULT_UNKNOWN');}
 if(reservation.status==='settled')return {callId:reservation.callId};
 if(reservation.status==='rejected')throw new GenerationFailure('waiting_user','CODEX_PREVIOUS_TURN_REJECTED');
 if(reservation.status==='reserved'&&reservation.sessionId)throw new GenerationFailure('waiting_user','CODEX_PREPARED_THREAD_REQUIRES_RECONCILIATION');
 if(reservation.status==='reserved'&&reservation.providerTurnId)throw new GenerationFailure('unknown_result','CODEX_TURN_RESULT_UNKNOWN');
 let owned:Awaited<ReturnType<typeof createControlledCodexSession>>;
 try{
 if(input.modelRoutingVersion===2&&reservation.status==='reserved'){
  const selected=executionModelSpecSchema.parse(await call('resolveModelCredential',{capability:input.capability},signal));
  if(!('engine' in selected)||selected.engine!=='codex'||selected.requestedModel!==input.requestedModel)throw new GenerationFailure('waiting_user','MODEL_ROUTE_IDENTITY_CHANGED');
 }
 const nativeImages=input.modelRoutingVersion!==2;
 try{owned=await createControlledCodexSession(cwd,signal,undefined,nativeImages,true);}catch(error){
  if(!nativeImages||!(error instanceof CodexHostError)||!['CODEX_IMAGE_CAPABILITY_UNAVAILABLE','CODEX_IMAGE_MODEL_UNAVAILABLE'].includes(error.code))throw error;
  owned=await createControlledCodexSession(cwd,signal,undefined,false,true);
 }
 }catch(error){
  signal.throwIfAborted();if(error instanceof Error&&error.name==='AbortError')throw error;
  const clean=reservation.status==='reserved'&&!reservation.sessionId&&!reservation.providerTurnId;
  const localRejection=error instanceof CodexHostError;
  const credentialRejection=error instanceof GenerationFailure&&error.outcome==='waiting_user'&&['MODEL_AUTHORITY_CHANGED','MODEL_CREDENTIAL_UNAVAILABLE','MODEL_ROUTE_IDENTITY_CHANGED'].includes(error.errorCode);
  if(!clean||(!localRejection&&!credentialRejection))throw new GenerationFailure('unknown_result',localRejection?error.code:'CODEX_PRECHECK_RESULT_UNKNOWN');
  const rejectionCode=localRejection?error.code:(error as GenerationFailure).errorCode;
  try{
   const saved=externalChatTurnStateSchema.parse(await call('settleExternalChatTurn',{callId:reservation.callId,status:'rejected',rejectionCode},signal));
   if(saved.callId!==reservation.callId||saved.status!=='rejected')throw new Error('UNCONFIRMED_SETTLEMENT');
  }catch(settlementError){
   signal.throwIfAborted();if(settlementError instanceof Error&&settlementError.name==='AbortError')throw settlementError;
   throw new GenerationFailure('unknown_result','CODEX_SETTLEMENT_RECEIPT_UNKNOWN');
  }
  throw new GenerationFailure('waiting_user',localRejection?'CODEX_SESSION_PRECHECK_REJECTED':rejectionCode);
 }
 let admission=reservation.status==='started'||reservation.status==='unknown',sessionId:string|undefined,actualTurnId:string|undefined,recoveredFacts:{model:string|null;modelProvider:string|null}|undefined;
 const consumer=createExternalChatToolConsumer(input,reservation.callId,signal,call);
 try{
  let result;
  if(reservation.status==='started'||reservation.status==='unknown'){
   admission=true;
   if(reservation.protocolKind!=='codex-app-server'||!reservation.sessionId||!reservation.providerTurnId)throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
   const binding=await call('readCodexCall',{callId:reservation.callId},signal) as {threadId?:string;turnId?:string;modelFacts?:typeof recoveredFacts};
   if(binding.threadId!==reservation.sessionId||binding.turnId!==reservation.providerTurnId)throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');recoveredFacts=binding.modelFacts;
   if(input.modelRoutingVersion===2)await recoverRoutedChatChildren(signal,call);else await recoverExternalChatChildren(signal,call);
   result=await recoverCodexNativeTurn(owned.rpc,reservation.sessionId,reservation.providerTurnId);
  }else{
   if(!owned.authenticated)throw new CodexHostError('CODEX_LOGIN_REQUIRED');
   const definitions=externalTaskToolListSchema.parse(await call('listExternalTaskTools',{},signal)).tools;
   const tools=definitions.map(tool=>({name:chatToolProviderName(tool.name),description:tool.description,inputSchema:tool.inputSchema}));
   const names=new Map(definitions.map(tool=>[chatToolProviderName(tool.name),tool.name]));
   result=await runCodexNativeTurn({rpc:owned.rpc,mcpNames:owned.mcpNames,cwd,prompt,signal,tools,images,...(input.modelRoutingVersion===2?{model:input.requestedModel}:{}),
    onUsage:async usage=>{if(!sessionId||!actualTurnId)throw new CodexHostError('CODEX_TURN_RECEIPT_UNKNOWN');const saved=await call('bindCodexCall',{callId:reservation.callId,observedUsage:{inputTokens:usage.inputTokens??undefined,outputTokens:usage.outputTokens??undefined,totalTokens:usage.totalTokens??undefined}}) as {budgetExceeded?:boolean};return saved.budgetExceeded===true||(usage.outputTokens!==null&&usage.outputTokens>input.maxOutputTokens);},
    onThread:async threadId=>{sessionId=threadId;const saved=externalChatTurnStateSchema.parse(await call('prepareExternalChatThread',{callId:reservation.callId,sessionId:threadId,protocolKind:'codex-app-server',protocolVersion:1},signal));if(saved.callId!==reservation.callId||saved.sessionId!==threadId||saved.status!=='reserved')throw new CodexHostError('CODEX_THREAD_RECEIPT_UNKNOWN');},
    onAdmission:async sessionId=>{admission=true;const saved=externalChatTurnStateSchema.parse(await call('startExternalChatTurn',{callId:reservation.callId,sessionId,protocolKind:'codex-app-server',protocolVersion:1},signal));if(saved.callId!==reservation.callId||saved.status!=='started')throw new CodexHostError('CODEX_START_RECEIPT_UNKNOWN');},
    onTurn:async providerTurnId=>{const saved=externalChatTurnStateSchema.parse(await call('recordExternalChatProviderTurn',{callId:reservation.callId,providerTurnId},signal));if(saved.callId!==reservation.callId||saved.providerTurnId!==providerTurnId)throw new CodexHostError('CODEX_TURN_RECEIPT_UNKNOWN');if(!sessionId)throw new CodexHostError('CODEX_THREAD_RECEIPT_UNKNOWN');await call('bindCodexCall',{callId:reservation.callId,threadId:sessionId,turnId:providerTurnId},signal);actualTurnId=providerTurnId;},
    onTool:async(toolCallId,name,toolInput)=>{
     const toolName=names.get(name);if(!toolName)throw new CodexHostError('CODEX_TOOL_UNAVAILABLE');
     const saved=externalTaskToolResultSchema.parse(consumer.handles(toolName)?await consumer.run(toolCallId,toolName,toolInput):await call('executeExternalTaskTool',{turnCallId:reservation.callId,toolCallId,toolName,input:toolInput},signal));
     if(saved.turnCallId!==reservation.callId||saved.toolCallId!==toolCallId||saved.status!=='settled'||!saved.outcome)throw new CodexHostError('CODEX_TOOL_RESULT_UNKNOWN');
     return {text:JSON.stringify(saved.outcome),success:saved.outcome.status==='ok'||saved.outcome.status==='partial'};
    },onText});
  }
  await call('bindCodexCall',{callId:reservation.callId,modelFacts:recoveredFacts??{model:result.model??null,modelProvider:result.modelProvider??null}});
  const imageResult=await saveNativeChatImages(result,reservation.callId,signal,call),{images:_native,model:_model,modelProvider:_provider,...textResult}=result;
  if(imageResult.imageFailures.length)textResult.text+='\n\n部分图片未能保存，请在 CreatorOS 中重新生成这些图片。';
  signal.throwIfAborted();const receipt=externalChatReceiptSchema.parse({schemaVersion:1,engine:'codex',protocolKind:'codex-app-server',protocolVersion:1,turnId:reservation.callId,stopReason:'end_turn',...textResult,...imageResult});
  const saved=externalChatTurnStateSchema.parse(await call('settleExternalChatTurn',{callId:reservation.callId,status:'settled',receipt},signal));
  if(saved.callId!==reservation.callId||saved.status!=='settled')throw new CodexHostError('CODEX_SETTLEMENT_RECEIPT_UNKNOWN');
  return {callId:reservation.callId};
 }catch(error){
  signal.throwIfAborted();if(error instanceof Error&&error.name==='AbortError')throw error;
  const errorCode=error instanceof CodexHostError?error.code:'CODEX_HOST_FAILED';
  try{await call('settleExternalChatTurn',admission?{callId:reservation.callId,status:'unknown'}:{callId:reservation.callId,status:'rejected',rejectionCode:errorCode});}catch{/* 原始故障与账本留给宿主对账。 */}
  throw new GenerationFailure(admission?'unknown_result':'waiting_user',errorCode);
 }finally{await Promise.allSettled([consumer.close(),owned.rpc.close()]);}
}
